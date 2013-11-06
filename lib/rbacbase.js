/*
 *  RbacBase.js 
 *  Provides NIST Level 2 Standard Role Based Access Control functionality
 * 
 *  Copyright (C) 2013 Martin Dobrev <martin.dobrev@unixsol.co.uk>
 *  UNIXSOL LTD, registered company in UK and Wales
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU Affero Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU Affero Public License for more details.
 *
 *  You should have received a copy of the GNU Affero Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 *  @author: Martin Dobrev <martin.dobrev@unixsol.co.uk>
 *  @file
 *  Provides NIST Level 2 Standard Role Based Access Control functionality
 *
 *  @defgroup node-rbac RBAC Functionality
 *  @{
 *  Documentation for all node-rbac related functionality.
 */
// RbacBase
// ----------
(function(define) {

"use strict";

	define(function(require, exports) {
		var Common = require('./common').Common;
		var Q = require('q');
		var _ = require('underscore');
		
		// The `RbacBase` is assumed as the object that all `clients`
		// inherit from, and is used in an `instanceof` check when initializing the
		// library. If you wish to write or customize an adapter, just inherit from
		// this base, with `RbacBase.extend`, and you're good to go.

		// The methods assumed when building a client.
		var RbacBase = {

	    	// Pass a config object into the constructor,
	    	// which then initializes the pool and
	  		constructor: function(config) {
	    		if (config.debug) this.isDebugging = true;
	    	},

	    	// Private functions
			rootId: function() {
				return 1;
			},

			getIdField: function() {
				return this.idField;
			},

			getTableField: function() {
				return this.table;
			},

			getLeftField: function() {
				return this.leftField;
			},

			getRightField: function() {
				return this.rightField;
			},

			getDescriptionField: function() {
				return this.descriptionField;
			},

			getTitleField: function() {
				return this.titleField;
			},

			/**
			 * Return type of current instance, e.g roles, permissions
			 *
			 * @return string
			 */
			type: function() {

			},

			/**
			 * Adds a new role or permission
			 * Returns new entry's ID
			 *
			 * @param string title
			 *        	Title of the new entry
			 * @param integer description
			 *        	Description of the new entry
			 * @param integer parentId
			 *        	optional ID of the parent node in the hierarchy
			 * @return integer ID of the new entry
			 */
			add: function (title, description, parentId) {
				if (undefined === parentId) {
					parentId = this.rootId();
				}

				var data = {
						title: title,
						description: description,
						where: {},
					};
				data['where'][this.idField] = parentId;

				return Q.when(this.nestedSet.insertChildData(this, data)).then(function (id) {
						console.log(JSON.stringify(id));
						return id;
					},
					function (err) {
						console.log(err);
					});
			},


			/**
			 * Return count of the entity
			 *
			 * @return integer
			 */
			count: function() {
				var knex = this.knex;
				var table = this.getTableField();

				return Q.when(knex(table).select(knex.raw("COUNT(*) AS cnt")).then(function (res) {
					if (res) {
						return res[0].cnt;
					} else {
						return null;
					}
				}));
			},

			/**
			 * Returns the path to a node, including the node
			 *
			 * @param Integer id
			 * @return Rowset nodes in path
			 */
			path: function(id)
			{
			    var knex = require("knex").knex;

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
						.then(function (result)
							{
								if (_.isEmpty(result))
								{
									return null;
								}
								return result;
							}, function (err)
							{
								console.log(err);
								return null;
							}));
				
				return Q.all(promises).then(function (results)
				{
					return results[0];
				})
			},

			/**
			 * Returns ID of a path
			 *
			 * @todo this has a limit of 1000 characters on path
			 * @param string path
			 *        	such as /role1/role2/role3 ( a single slash is root)
			 * @return integer NULL
			 */
			pathId: function (path) {
				console.log("Path to check: "+path);
				
				if (path.substr(0, 1) !== "/") {
			    	path = "/" + path;
			    }
				var path = 'root'+path;
				var knex = require("knex").knex;

				var left = this.getLeftField();
				var right = this.getRightField();
				var table = this.getTableField();
				var title = this.getTitleField();
				var tid = this.getIdField();

				var self = this;

				if(path.substr(-1) == '/') {
			        path = path.substr(0, path.length - 1);
			    }

			    var parts = path.split('/');

			    // @todo add logic for SQLite
			    var groupConcat = "GROUP_CONCAT(parent."+title+" ORDER BY parent."+left+" SEPARATOR '/')";
			    var query_char_count = 0;
			    var separator_count = 0;
			    var total_char_count = 0;

			    return Q.when(knex(table).select(knex.raw("sum(char_length("+title+")) AS title_length"))
			    		.then(function (res) {
					    	query_char_count = res[0].title_length;

					    	return Q.when(self.count()).then(function (cnt){
					    		separator_count = --cnt;
					    		total_char_count = query_char_count + separator_count;

					    		if (total_char_count > 1024) {
					    			throw new Error("Path exceeds character count limit.")
					    		}

					    		var query = "SELECT node."+tid+" AS ID, "+groupConcat+" AS Path "
										+"FROM "+table+" AS node, "
										+""+table+" AS parent "
										+"WHERE node."+left+" BETWEEN parent."+left+" AND parent."+right+" "
										+"AND node.title='"+parts[parts.length-1]+"' "
										+"GROUP BY node."+tid+" "
										+"HAVING Path='"+path+"'";

								var queryBase = "SELECT n0."+tid+" FROM "+table+" AS n0 ";
					    		var queryCondition = "WHERE n0.title='"+parts[parts.length-1]+"' ";
					    		for (var i=1; i<parts.length; i++) {
						    			var j = -1 + i;

						    			queryBase += "JOIN "+table+ " AS n"+i+" ON (n"+j+"."+left+" BETWEEN n"+i+"."+left+"+1 AND n"+i+"."+right+") ";
						    			queryCondition += " AND n"+i+".title='"+parts[parts.length-i]+"'";
						    			queryBase += "LEFT JOIN "+table+" AS nn"+i+" ON (nn"+i+"."+left+" BETWEEN n"+i+"."+left+"+1 AND n"+j+"."+left+"-1) ";
						    			queryCondition += " AND nn"+i+"."+left+" IS NULL";
						    	}
						    	//var query = '' + queryBase + queryCondition;

					    		return Q.when(
					    			knex.raw(query).then(function (results) {
					    				if (_.isObject(results[0][0])) {
					    					return results[0][0].ID;
					    				} else {
					    					return null;
					    				}
					    			},
					    			function (err) {
					    				console.log(err);
					    			})
					    		).then(function (results) {
					    			return results;
					    		},
					    		function (err){
					    			console.log(err);
					    		});
					    	});
						},
						function (err){
							console.log(err);
						})
					).then(function (result) {
			    		return result;
			    	});
			},

			getRecord: function (id, needle) {
				var knex = this.knex;

				var left = this.getLeftField();
				var right = this.getRightField();
				var table = this.getTableField();
				var title = this.getTitleField();
				var description = this.getDescriptionField();
				var tid = this.getIdField();

				return Q(knex(table).where(tid, id).select(needle).then(function (results) {
					if (!results) {
						return null;
					} else {
						return results[0][needle];
					}
				}));
			},

			titleId: function (title) {

			},

			getTitle: function (id) {
				return Q.when(this.getRecord(id, this.getTitleField()))
				.then(function (ids) {
					return ids;
				});
			},

			getDescription: function (id) {
				return Q.when(this.getRecord(id, this.getDescriptionField()))
				.then(function (ids) {
					return ids;
				});
			},

			addPath: function (path, descriptions) {
				var self = this;

				if (path.substr(0,1) !== '/') {
					throw new Error("Path is not valid");
				}

				path = path.substr(1, path.length);
				parts = path.split("/");

				var parent = 1;
				var index = 0;
				var currentPath = "";
				var promises = [];

				_.each(parts, function(part) {
					var description = "";
					if (_.isArray(descriptions)) {
						description = descriptions[index];
					}

					currentPath += '/'+part;


					Q.when(self.pathId(currentPath))
					.then(function (t) {
						console.log(''+currentPath+": "+t);
						if (null == t) {
							Q.when(self.add(part, description, parent)).then(function (id) {
								console.log(""+id);
								parent = id;
							},
							function (err) {
								console.log(err);
							});
						} else {
							parent = t;
						}
						index++;
					});
				});

				return Q(parent);
			},

			edit: function (id, newTitle, newDescription) {
				var data = {};

				if (undefined !== newTitle) {
					data[this.getTitleField()] = newTitle;
				}

				if (undefined !== newDescription) {
					data[this.getDescriptionField()] = newDescription;
				}

				return this.editData(id, data) == 1;
			},

			children: function (id) {
				return this.super_.children(id);
			},

			descendants: function (id) {
				return this.super_.descendants();
			},
	    };
	  	
	  	exports.RbacBase = RbacBase;
	});
})(
  typeof define === 'function' && define.amd ? define : function(factory) { factory(require, exports);
});
