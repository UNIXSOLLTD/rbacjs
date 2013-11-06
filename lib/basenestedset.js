/**
 * BaseNestedSet Class
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

// Some functions which are basic for the nested set classes
define(function(require, exports) {

	var _ = require('underscore');
	var Q = require('q');
	var Common = require('./common').Common;

	function BaseNestedSet(options)
	{
		var self = this;

		if (!options) {
			options = {}
		}

		if (!options.table) {
			throw "Missing table option"
		}
		
		_.defaults(options, {
			idField: 'id',
			leftField: "Left",
			rightField: "Right",
		});

		BaseNestedSet.super_.call(this, options);

		this.options = options;
		this.properties = _.isArray(options.properties) ? options.properties : [];

		this.knex = require('knex').knex;

		_.each(options, function (value, option)
		{
			self._set(option, value)
		});
	};

	_.extend(BaseNestedSet.prototype, Common, {
		// Private functions
		getIdField: function() {
			return this.get('idField');
		},

		getTableField: function() {
			return this.get('table');
		},

		getLeftField: function() {
			return this.get('leftField');
		},

		getRightField: function() {
			return this.get('rightField');
		},

		/**
		 * Returns number of descendants 
		 *
		 * @param Integer $ID
		 * @return Integer Count
		 */
		descendantCount: function(id) {
			var knex = this.get('knex');

			return Q(knex(this.getTable()).where(this.getId(), id).select(knex.raw('SELECT (' + this.getRight() + '-' + this.getLeft() + '-1)/2 AS `count`')).then(function (result)
			{
				if (!result) {
					return null;
				}

				return result[0].count;
			}));
		},

		/**
		 * Returns the depth of a node in the tree
		 * Note: this uses Path
		 * @param Integer $ID
		 * @return Integer Depth from zero upwards
		 * @seealso Path
		 */
		depth: function(id)	{
			var path = this.path(id);
			return (path.length - 1);
		},

		 /**
		 * Returns a sibling of the current node
		 * Note: You can't find siblings of roots 
		 * Note: this is a heavy function on nested sets, uses both Children (which is quite heavy) and Path
		 * @param Integer $ID
		 * @param Integer $SiblingDistance from current node (negative or positive)
		 * @return Array Node on success, null on failure 
		 */
		sibling: function(id, distance) {
			var dist = distance || 1;
			var tid = this.getId();
			var parent = this.parentNode(id);
			var siblings = this.children(parent[tid]);

			if (!siblings) {
				return null;
			}

			var count = 0;

			_.each(siblings, function(sibling)
			{
				if (sibling === tid)
				{
					return siblings[count+distance];
				}
				count++;
			});

			return null;
		},

		/**
		 * Returns the parent of a node
		 * Note: this uses Path
		 * @param Integer $ID
		 * @return Array ParentNode (null on failure)
		 * @seealso Path
		 */
		parentNode: function(id) {
			var path=this.path(id);

			if (path.length < 2) {
				return null;
			} else {
				return path[path.length - 2];
			}
		},

		/**
		 * Deletes a node and shifts the children up
		 *
		 * @param Integer id
		 */
		delete: function (id) {
			var knex = this.knex;
			var info = null;

			var left = this.getLeft();
			var right = this.getRight();
			var table = this.getTable();

			promises = [];

			promises.push(knex(table).where(this.getId(), id).select(knex.raw("SELECT " + left + " AS `left`, " + right + " AS `right`")).then(function (result)
			{
				if (!result) {
					return null;
				}

				info = result[0];
				var promises=[];

				return Q.all(knex(table).where(left, info.left).del().then(function (cnt)
				{	
					promises.push(knex(table).whereBetween(left, [ info.left, info.right ]).update({left: left+'-1', right: right+'-1' }));
					promises.push(knex(table).where(right, '>', info.right).decrement(right, 2));
					promises.push(knex(table).where(left, '>', info.right).decrement(left, 2));

					Q.when(promises).then(function ()
					{
						return cnt;
					});
				}));
			}));

			return Q.all(promises);
		},

		/**
		 * Deletes a node and all its descendants
		 *
		 * @param Integer id
		 */
		deleteSubtree: function (id) {
			var knex = this.knex;
			var info = null;
			var left = this.getLeft();
			var right = this.getRight();
			var table = this.getTable();

			var promises = [];

			var select = knex.raw("SELECT " + left + " AS `left`, " + right + " AS `right`, " + right + "-" + left + "+1 AS `width`");
			
			promises.push(knex(table).where(this.getId(), id).select(select).then(function (result)
			{
				if (!result)
				{
					return null;
				}

				info = result[0];
				
				return Q(knex(table).whereBetween(left, [ info.left, info.right ]).del().then(function (cnt)
				{
					var promises=[];

					promises.push(
						knex(table)
							.where(right, ">", info.right)
							.decrement(right, width)
					);

					promises.push(
						knex(table)
							.where(left, ">", info.right)
							.decrement(left, width)
					);

					Q.when(promises).then(function()
					{
						return cnt;
					});
				}));
			}));

			return Q.all(promises);
		},

		/**
		 * Returns all descendants of a node
		 *
		 * @param Integer id
		 * @param Boolean absoluteDepths to return Depth of sub-tree from zero or absolutely from the whole tree  
		 * @return Rowset including Depth field
		 * @seealso Children
		 */
		descendants: function (id, absoluteDepths) {
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
			       			+" AND node."+tid+" = "+id
			       			+" GROUP BY node."+tid
			       			+" ORDER BY node."+left
			       		+") AS sub_tree "
			    	+"WHERE node."+left+" BETWEEN parent."+left+" AND parent."+right
			    		+" AND node."+left+" BETWEEN sub_parent."+left+" AND sub_parent."+right
			    		+" AND sub_parent."+tid+" = sub_tree."+tid
			    	+" GROUP BY node."+tid
			    	+" HAVING Depth > 0"
			    	+" ORDER BY node."+left 
			    	).then(function (result)
					    {
					    	return result[0];

					    }, 
					    function (err)
			    		{
			    			console.log("node-rbac SQL Query exception: "+err);
			    		}))
			    	.then(function (result)
					    {
					    	descendants = result;
					    	return true;

					    }, 
					    function (err)
			    		{
			    			console.log("node-rbac promise exception: "+err);
			    		})
					.done();
			return descendants;
		},

		/**
		 * Returns immediate children of a node
		 * Note: this function performs the same as Descendants but only returns results with Depth=1
		 * @param Integer $ID
		 * @return Rowset not including Depth
		 * @seealso Descendants
		 */
		children: function (id) {
			var knex = this.knex;

			var info = null;
			var left = this.getLeftField();
			var right = this.getRightField();
			var table = this.getTableField();
			var tid = this.getIdField();

			var promises = [];
			var children = [];

			result = Q.all(knex.raw(
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
					    			delete entry.Depth;
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
					    	descendants = result;
					    	return true;
					    }, 
					    function (err)
			    		{
			    			console.log("node-rbac promise exception: "+err);
			    		});
					//.done(); // end Q.all
			console.log(result);
		},

		/**
		 * Returns the path to a node, including the node
		 *
		 * @param Integer $ID
		 * @return Rowset nodes in path
		 */
		path: function(id) {
		    var knex = this.knex;

			var left = this.getLeftField();
			var right = this.getRightField();
			var table = this.getTableField();
			var tid = this.getIdField();

			var promises = [];

			var count = 0;

			promises.push(knex(knex.raw(table+" AS node, "+table+" AS parent"))
						.where(knex.raw('node.'+left+" BETWEEN parent."+left+" AND parent."+right))
						.andWhere("node."+tid, id)
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
		 *	Note: if you don' specify PID, There would be one less AND in the SQL Query
		 * @param Integer $PID
		 * @return Rowset Leaves
		 */
		leaves: function (pid) {
		    var knex = this.knex;

			var left = this.getLeftField();
			var right = this.getRightField();
			var table = this.getTableField();
			var tid = this.getIdField();

			var promises = [];

			var count = 0;

		    if (undefined !== pid) {
		    	promises.push(knex(table)
		    				.where(right, left+"+1")
		    				.andWhere(knex.raw(left+" BETWEEN (SELECT "+left+" FROM "+table+" WHERE "+tid+"="+pid+") AND "
		    									+"(SELECT "+right+" FROM "+table+" WHERE "+tid+"="+pid+")"))
		    				.select()
		    			.then(function (results)
		    				{
		    					return results;
		    				},
		    				function (err)
		    				{
		    					console.log("node-rdac query exception: " + err);
		    					return null;
		    				})
		    			);
		    } else {
		    	promises.push(knex(table)
		    				.where(right, left+"+1")
		    				.select()
		    			.then(function (results)
			    			{
			    				return results;
			    			},
			    			function (err)
			    			{
			    				console.log("node-rdac query exception: " + err);
		    					return null;
			    			})
		    			);
		    }
		    
		    return Q.all(promises).then(function (results)
		    {
		    	return results[0];
		    });
		},

		/**
		 * Adds a sibling after a node
		 *
		 * @param Integer $ID
		 * @return Integer SiblingID
		 */
		insertSibling: function (id) {
		    var knex = this.knex;

		    var self = this;
			var left = this.getLeftField();
			var right = this.getRightField();
			var table = this.getTableField();
			var tid = this.getId();

			var promises = [];

		    if (undefined === id)
		    {
		    	id = 0;
		    }

		    promises.push(knex(table)
		    			.where(tid, id)
		    			.select(right+" AS Right")
		    			.then(function (results)
			    			{
			    				var siblright;
			    				var promise=[];
			    				var robj = {};
								var lobj = {};

			    				if (!results) {
			    					siblright=0;
			    				} else {
			    					
			    					siblright=results[0].Right;
			    				}
			    				console.log(results, lobj, robj);

			    				promise.push(knex(table).where(right, ">", siblright).increment(right, 2));
								promise.push(knex(table).where(left, ">", siblright).increment(left, 2));

								return Q.all(promise).then(function ()
									{
										var child={};

										child[left] = 1+siblright;
										child[right]= 2+siblright;
										return Q(knex(table).insert(child)).then(function (res) 
											{
												return res;
											});
									});
			    			},
			    			function (err)
			    			{
			    				console.log(err);
			    			})
		    		);

		    return Q.all(promises).then(function (results)
		    {
		    	return results[0];
		    });
		},

		/**
		 * Adds a child to the beginning of a node's children
		 *
		 * @param Integer $PID
		 * @return Integer ChildID
		 */
		insertChild: function (pid)
		{
			var knex = this.knex;

			var self = this;
			var left = this.getLeftField();
			var right = this.getRightField();
			var table = this.getTableField();
			var tid = this.getIdField();

			var promises = [];

			if (undefined === pid) {
				pid = 0;
			}

			promises.push(knex(table)
						.where(tid, pid)
						.select(left+" AS Left")
						.then(function (results)
							{
								var siblleft;
								var promise=[];

								if (_.isEmpty(results))
								{
									siblleft = 0;
								} else {
									siblleft = results[0].Left
								}

								promise.push(knex(table).where(right, ">", siblleft).increment(right, 2));
								promise.push(knex(table).where(left, ">", siblleft).increment(left, 2));

								return Q.all(promise).then(function ()
									{
										var child={};

										child[left] = 1+siblleft;
										child[right]= 2+siblleft;
										return Q(knex(table).insert(child)).then(function (res) 
											{
												return res;
											});
									})
							},
							function (err)
							{
								console.log(err);
								return null;
							})
					); // promises.push
			return Q.all(promises).then(function (results)
				{
					return results[0];
				})
		},

		/**
		 * Retrives the full tree including Depth field.
		 *
		 * @return 2DArray Rowset
		 */
		fullTree: function() {
			var knex = this.knex;

			var left = this.getLeftField();
			var right = this.getRightField();
			var table = this.getTableField();
			var tid = this.getIdField();

			var promises = [];

			promises.push(knex(knex.raw(table+" AS node, "+table+" AS parent"))
						.where(knex.raw("node."+left+" BETWEEN parent."+left+" AND parent."+right))
						.groupBy("node."+tid)
						.orderBy("node."+left)
						.select(knex.raw("node.*, (COUNT(parent."+tid+") - 1) AS Depth"))
						.then(function (result)
							{
								return result;
							},
							function (err)
							{
								console.log(err);
								return null;
							})
					); // promise.push

			return Q.all(promises).then(function (results)
				{
					return results[0];
				});
		},
	}); // Module extend
	exports.BaseNestedSet = BaseNestedSet;

});

})(
  typeof define === 'function' && define.amd ? define : function (factory) { factory(require, exports); }
);
