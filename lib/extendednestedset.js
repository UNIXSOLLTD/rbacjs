/**
 * ExtendedNestedSet Class
 * This class provides a means to implement Hierarchical data in flat SQL tables.
 * Queries extracted from http://mikehillyer.com/articles/managing-hierarchical-data-in-mysql/
 *
 * Tested and working properly
 * 
 * Usage:
 * have a table with at least 3 INT fields for ID, Left and Right.
 * Create a new instance of this class and pass the name of table and name of the 3 fields above
  */
//FIXME: many of these operations should be done in a transaction
(function(define) {

"use strict";

// Some functions which are extended for the basic nested class
define(function(require, exports) {

	var _ = require('underscore');
	var Q = require('q');
	var Knex = require('knex');
	var BaseNestedSet = require('./basenestedset').BaseNestedSet;
	var self;

	var ExtendedNestedSet = function(options) {
		self = this;

		if (!options) {
			options = {}
		}
		if (!options.table) {
			throw "Missing table option"
		}

		this.properties = _.isArray(options) ? options : [options];
		this.knex = require('knex').knex;
	}

	_.extend(ExtendedNestedSet.prototype, BaseNestedSet, {
		// Private functions
		lock: function () {
			var knex;
			return Q.all(knex.raw("LOCK TABLE "+this.table+" WRITE"));
		},
		unlock: function () {
			var knex = this.knex;
			return Q.all(knex.raw("UNLOCK TABLES"));
		},

		/**
		 * Returns the ID of a node based on a SQL conditional string
		 * It accepts other params in the PreparedStatements format
		 *
		 * @param Object builder Caller method
		 * @param Object condition the SQL condition, such as `{Title: ?}`
		 * @return Integer ID
		 */		
		getIdConditional: function(builder, condition)
		{
			var knex = this.knex;

			return Q.when(knex(builder.table)
							.limit(1)
							.where(condition)
							.select(knex.raw(builder.idField+" AS `ID`"))
					).then(function (results) {
						console.log(results);
						if (_.isEmpty(results)) {
							return false;
						}
						return results[0]['ID'];
					},
					function (err) {
						throw new Error(err);
					});
		},

		getRecord: function(condition, rest) {

		},

		depthConditional: function (condition, rest) {

		},

		siblingConditional: function (condition, rest) {

		},

		parentNodeConditional: function (condition, rest) {

		},

		/**
		 * Deletes a node and shifts the children up
		 * Note: use a condition to support only 1 row, LIMIT 1 used.
		 * @param String $ConditionString
		 * @param string $Rest optional, rest of variables to fill in placeholders of condition string, one variable for each ? in condition
		 * @return boolean
		 */
		deleteConditional: function (builder, condition) {
			var knex = this.knex;

			return Q.when(knex(builder.table)
							.where(condition)
							.limit(1)
							.select(knex.raw(builder.leftField+" AS `Left`, "+builder.rightField+" AS `Right`")))
					.then(function (info) {
						console.log(info);
						var promises = [];
						if (_.isEmpty(info)) {
							return false;
						} else {
							info = info[0];
						}

						var toUpdate = {};
						toUpdate[builder.leftField] = builder.leftField+"-1";
						toUpdate[builder.rightField]= builder.rightField+"-1";

						promises.push(knex(builder.table).where(builder.leftField, info['Left']).del());
						promises.push(knex(builder.table).whereBetween(builder.leftField, [ info['Left'], info['Right'] ]).update(toUpdate));
						promises.push(knex(builder.table).where(builder.rightField, ">", info['Right']).decrement(builder.rightField, 2));
						promises.push(knex(builder.table).where(builder.leftField, ">", info['Right']).decrement(builder.leftField, 2));

						return Q.all(promises).spread(function (cnt) {
							return cnt == 1;
						});
					},
					function (err) {
						console.log(err);
						throw new Error(err);
					});
		},

		/**
	     * Deletes a node and all its descendants
	     *
	     * @param Object builder Parent class caller
		 * @param string where Condition fullfilment
		 * @return boolean
	     */
		deleteSubtreeConditional: function (builder, where) {
			var knex = this.knex;

			return Q.when(knex(builder.table)
							.where(where)
							.select(knex.raw(builder.leftField+" AS `Left`, "
											+builder.rightField+" AS `Right`, "
											+builder.rightField+"-"+builder.leftField+"+1 AS `Width`"))
							)
					.then(function (info) {
						console.log(info);
						
						var promises = [];
						info = info[0];

						promises.push(knex(builder.table).whereBetween(builder.leftField, [ info['Left'], info['Right'] ]).del());
						promises.push(knex(builder.table).where(builder.rightField, ">", info['Right']).decrement(builder.rightField, info['Width']));
						promises.push(knex(builder.table).where(builder.leftField, ">", info['Right']).decrement(builder.leftField, info['Width']));

						return Q.all(promises).spread(function (cnt) {
							console.log(cnt);
							return cnt >= 1;
						});
					},
					function (err) {
						console.log(err);
						throw new Error(err);
					});
		},

		/**
		 * Returns all descendants of a node
		 *
		 * @param Object builder Caller method object
		 * @param string condition 
		 * @param Boolean absoluteDepths to return Depth of sub-tree from zero or absolutely from the whole tree  
		 * @return Rowset including Depth field
		 * @seealso Children
		 */
		descendantsConditional: function (builder, condition, absoluteDepths) {
		    var knex = this.knex;
			var info = null;
			var left = this.getLeftField();
			var right = this.getRightField();
			var table = this.getTableField();
			var tid = this.getIdField();
			var depthConcat = "";

			var promises = descendants = [];

		    if (absoluteDepths !== undefined) {
		    	depthConcat = " - (sub_tree.depth)";
		    }
		    
		    if (_.isArray(condition)) {
		    	throw new Error('Condition must be a string value. Example `id=?`');
		    }

		    //console.log(knex);
			return Q.all(knex.raw(
			    	 "SELECT node.*, (COUNT(parent."+tid+") - 1"+depthConcat+") AS Depth "
			        +"FROM "+table+" AS node, "
			       		+""+table+" AS parent, "
			       		+""+table+" AS sub_parent, "
			       		+"("
			       			+" SELECT node."+tid+", (COUNT(parent."+tid+") - 1) AS depth "
			       			+" FROM "+table+" AS node, "
			       				+table+" AS parent "
			       			+" WHERE node."+left+" BETWEEN parent."+left+" AND parent."+right
			       			+" AND node."+condition
			       			+" GROUP BY node."+tid
			       			+" ORDER BY node."+left
			       		+") AS sub_tree "
			    	+"WHERE node."+left+" BETWEEN parent."+left+" AND parent."+right
			    		+" AND node."+left+" BETWEEN sub_parent."+left+" AND sub_parent."+right
			    		+" AND sub_parent."+tid+" = sub_tree."+tid
			    	+" GROUP BY node."+tid
			    	+" HAVING Depth > 0"
			    	+" ORDER BY node."+left 
			    	)).then(function (result)
					    {
					    	return result[0];
					    }, 
					    function (err)
			    		{
			    			console.log("node-rbac SQL Query exception: "+err);
			    		});
		},

		/**
		 * Returns immediate children of a node
		 * Note: this function performs the same as Descendants but only returns results with Depth=1
		 * @param Integer $ID
		 * @return Rowset not including Depth
		 * @seealso Descendants
		 */
		childrenConditional: function (builder, condition) {
			var knex = this.knex;

			var info = null;
			var left = this.getLeftField();
			var right = this.getRightField();
			var table = this.getTableField();
			var tid = this.getIdField();

			var promises = [];
			var children = [];

			return Q.all(knex.raw(
			    	 "SELECT node.*, (COUNT(parent."+tid+") - 1 - (sub_tree.depth )) AS Depth "
			        +"FROM "+table+" AS node, "
			       		+table+" AS parent, "
			       		+table+" AS sub_parent, "
			       		+"("
			       			+" SELECT node."+tid+", (COUNT(parent."+tid+") - 1) AS depth "
			       			+" FROM "+table+" AS node, "
			       				+table+" AS parent "
			       			+" WHERE node."+left+" BETWEEN parent."+left+" AND parent."+right
			       			+" AND (node."+condition+")"
			       			+" GROUP BY node."+tid
			       			+" ORDER BY node."+left
			       		+") AS sub_tree "
			    	+"WHERE node."+left+" BETWEEN parent."+left+" AND parent."+right
			    		+" AND node."+left+" BETWEEN sub_parent."+left+" AND sub_parent."+right
			    		+" AND sub_parent."+tid+" = sub_tree."+tid
			    	+" GROUP BY node."+tid
			    	+" HAVING Depth = 1"
			    	+" ORDER BY node."+left 
			    	).then(function (result)
					    {
					    	// Check if we got a result
					    	if (result) {
					    		// Cycle through results
					    		_.each(result[0], function (entry)
					    		{
					    			delete entry.Depth; // Remove Depth from results
					    			children.push(entry);
					    		});
					    	}
					    	console.log(children);
					    	return children;

					    }, 
					    function (err) {
			    			throw new Error("node-rbac SQL Query exception: "+err);
			    		})) // end knex.raw
			    	.then(function (result) {
					    	return result;
					    }, 
					    function (err)
			    		{
			    			console.log("node-rbac promise exception: "+err);
			    		});
		},

		/**
		 * Returns the path to a node, including the node
		 * Note: use a single condition, or supply "node." before condition fields.

		 * @param Object builder Caller method
		 * @param string condition
		 * @return Rowset nodes in path
		 */
		pathConditional: function(builder, condition) {
		    var knex = this.knex;

			var left = this.getLeftField();
			var right = this.getRightField();
			var table = this.getTableField();
			var tid = this.getIdField();

			var promises = [];

			var count = 0;

			promises.push(knex(knex.raw(table+" AS node, "+table+" AS parent"))
						.where(knex.raw('node.'+left+" BETWEEN parent."+left+" AND parent."+right))
						.andWhere(knex.raw("node."+condition))
						.orderBy('parent.'+left)
						.select('parent.*')
					.then(function (result) {
							if (_.isEmpty(result)) {
								return null;
							}
							return result;
						}, function (err) {
							console.log(err);
							return null;
						}));
			
			return Q.all(promises).then(function (results) {
				return results[0];
			})
		},

		/**
		 * Finds all leaves of a parent
		 * Note: if you don' specify $PID, There would be one less AND in the SQL Query
		 * @param Object builder Parent class caller
		 * @param string where Condition fullfilment
		 * @return Rowset Leaves
		 */
		leavesConditional: function (builder, where) {
			var knex = this.knex;
			if (undefined === where) {
				return Q.all(knex(builder.table).where(builder.rightField, "1+"+builder.leftField).select())
						.then(function (results) {
							console.log(results);
							return results;
						},
						function (err) {
							throw new Error(err);
						});
			} else {
				var query = "SELECT * "
							+"FROM "+builder.table+" "
							+"WHERE "+builder.rightField+"="+builder.leftField+"+1 "
							+"AND "+builder.leftField+" BETWEEN "
							+"(SELECT "+builder.leftField+" FROM "+builder.table+" WHERE "+where+") "
							+"AND "
							+"(SELECT "+builder.rightField+" FROM "+builder.table+" WHERE "+where+") "
				return Q.all(knex.raw(query))
						.then(function (results) {
							console.log(results);
							return results;
						},
						function (err) {
							throw new Error(err);
						});
			}
		},

    	/**
	     * Adds a sibling after a node
	     *
	     * @param Object builder Caller Object
    	 * @param Object data Data to insert in the database `{title, description}`
     	 * @return Integer siblingID
	     */
		insertSiblingData: function (builder, data)	{
			var knex = this.knex;

			return Q.when(knex(builder.table)
						.where(data.where)
						.select(knex.raw(""+builder.rightField+" AS `Right`, "+builder.leftField+" AS `Left`"))
						.then(function (result) {
								var sibling=[];
								var promises = [];

								if (_.isEmpty(result)) {
									sibling['Left'] = sibling['Right'] = 0;
								} else {
									sibling = result[0];
								}
								
								promises.push(knex(builder.table).where(builder.rightField, '>', sibling['Right']).increment(builder.rightField, 2));
								promises.push(knex(builder.table).where(builder.leftField, '>', sibling['Left']).increment(builder.leftField, 2));
								
								return Q.all(promises)
										.then(function () {
											var toInsert = {};
											toInsert[builder.leftField]  = 1+sibling['Right'];
											toInsert[builder.rightField] = 2+sibling['Right'];
											toInsert[builder.titleField] = data.title;
											toInsert[builder.descriptionField] = data.description;

											return Q.when(knex(builder.table).insert(toInsert)).then(
												function (id) {
													return id;
												},
												function (err) {
													throw new Error(err);
												});
												
										},
										function (err) {
											throw new Error(err);
										})
							},
							function (err) {
								throw new Error(err);
							})
						);
		},

		/**
     	 * Adds a child to the beginning of a node's children
    	 *
    	 * @param Object builder Caller Object
    	 * @param Object data Data to insert in the database `{title, description}`
     	 * @return Integer ChildID
     	 */
		insertChildData: function (builder, data) {
			var knex = this.knex;

			return Q.when(knex(builder.table)
						.where(data.where)
						.select(knex.raw(""+builder.rightField+" AS `Right`, "+builder.leftField+" AS `Left`"))
						.then(function (result) {
								var parent=[];
								var promises = [];

								if (_.isEmpty(result)) {
									parent['Left'] = parent['Right'] = 0;
								} else {
									parent = result[0];
								}
								
								promises.push(knex(builder.table).where(builder.rightField, '>=', parent['Right']).increment(builder.rightField, 2));
								promises.push(knex(builder.table).where(builder.leftField, '>', parent['Left']).increment(builder.leftField, 2));
								
								return Q.all(promises)
										.then(function () {
											var toInsert = {};
											toInsert[builder.leftField]  = 0+parent['Right'];
											toInsert[builder.rightField] = 1+parent['Right'];
											toInsert[builder.titleField] = data.title;
											toInsert[builder.descriptionField] = data.description;

											return Q.when(knex(builder.table).insert(toInsert)).then(
												function (id) {
													return id;
												},
												function (err) {
													throw new Error(err);
												});
												
										},
										function (err) {
											throw new Error(err);
										})
							},
							function (err) {
								throw new Error(err);
							})
						);
		},

		/**
	     * Edits a node
	     *
    	 * @param Object builder Caller Object
    	 * @param Object data Data to insert in the database `{toUpdate: {data fields}, where: {conditions}}`
	     * @return Integer number of affected rows
	     */
		editData: function (builder, data)	{
			var knex = this.knex;

			return Q.when(knex(builder.table).where(data.where).update(data.toUpdate))
					.then(function (result) {
						return result[0];
					},
					function (err) {
						throw new Error(err);
					});
		},
	}); // End Module extend
	
	exports.ExtendedNestedSet = ExtendedNestedSet;

});

})(
  typeof define === 'function' && define.amd ? define : function (factory) { factory(require, exports); }
);
