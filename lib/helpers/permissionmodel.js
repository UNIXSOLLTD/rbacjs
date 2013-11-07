/*
 *  permissionmodel.js
 *  RBAC Permission Manager
 *  holds specific operations for permissions
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
 *  @file RBAC Permission Manager
 *
 *  @defgroup node-rbac RBAC Permission Model
 *  @{
 *  Documentation for all node-rbac related functionality.
 */
// ModelBase
// ----------
(function(define) {

"use strict";

define(function(require, exports) {
	var _ = require('underscore');
	var Q = require('q');
	var RbacBase = require('./../rbacbase').RbacBase;
	var c = require('validator').check;
	var s = require('validator').sanitize;
	var knex = require('knex').knex;

	var Common = require('./../common').Common;
	var ExtendedNestedSet = require('./../extendednestedset').ExtendedNestedSet;

	var PermissionManager = function(config) {
		var self = this;

		this.config = config;
		this.knex = require("knex").knex;
		
		_.extend(this, config['permissionsTable']);
		
		this.getField = function (table, id) {
			var tbl = self.config[table];

			if (!tbl) {
				return null;
			} else {
				if (!tbl[id]) {
					return null;
				}
				return tbl[id];
			}
		};
		this.nestedSet = new ExtendedNestedSet(config['permissionsTable']);
	};

	_.extend(PermissionManager.prototype, RbacBase, {
		initialize: function(options) {
			console.log('Permissions options: '+JSON.stringify(options));
			return PermissionManager(options);
		},
		// private functions
		/**
		 * Remove a permission from system
		 *
		 * @param integer $ID
		 *        	permission id
		 * @param boolean $Recursive
		 *        	delete all descendants
		 *
		 */
		remove: function(id, recursive) {
			var self=this;
			var promises = [];

			promises.push(this.unassignRoles(id));

			return Q.all(promises)
					.then(function () {
						var where = {};
						where[self.idField] = id;

						if (undefined === recursive) {
							return self.nestedSet.deleteConditional(self, where);
						} else {
							return self.nestedSet.deleteSubtreeConditional(self, where);
						}
					},
					function (err) {
						throw new Error(err);
					});
		},
		/**
		 * Unassignes all roles of this permission, and returns their number
		 *
		 * @param integer $ID
		 * @return integer
		 */
		unassignRoles: function(id) {
			return Q.when(
					knex(this.getField('rolePermissionsTable', 'table'))
					.where(this.getField('rolePermissionsTable','permissionIdField'), id)
					.del())
				.then(function (results) {
					//console.log(results);
					return results;
				},
				function (err) {
					throw new Error(err);
				});
		},

		/**
		 * Returns all roles assigned to a permission
		 *
		 * @param integer $Permission
		 *        	ID
		 * @param boolean $OnlyIDs
		 *        	if true, result would be a 1D array of IDs
		 * @return Array 2D or 1D or null
		 */
		roles: function(permission, onlyIDs)
		{
			var self = this;
			if (! /^\d+$/.test(permission)) {
				permission = this.permissionId(permission);
			}
			
			return Q.when(permission).then(function (perm) {
				if (undefined == onlyIDs) {
					return Q.when(
							knex(self.getField('rolePermissionsTable', 'table'))
							.where(self.getField('rolePermissionsTable', 'permissionIdField'), perm)
							.orderBy(self.getField('rolePermissionsTable', 'roleIdField'))
							.select(knex.raw(self.getField('rolePermissionsTable', 'roleIdField')+' AS ID'))
							.then(function (results) {
								if (_.isArray(results)) {
									var res = [];
									_.each(results, function (result) {
										if (result.ID) {
											res.push(result.ID);
										}
									});
									return res;
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
						function (err) {
							console.log(err);
						});
				} else {
					var query = "SELECT TP.* "
								+"FROM "+self.getField('rolePermissionsTable', 'table')+" AS TR "
								+"RIGHT JOIN "+self.getField('rolesTable', 'table')+" AS TP "
								+"ON (TR."+self.getField('rolePermissionsTable', 'roleIdField')+"=TP."
								+""+self.getField('rolesTable', 'idField')+") "
								+"WHERE "+self.getField('rolePermissionsTable', 'permissionIdField')+"="+permission+" ORDER BY TP."
								+""+self.getField('rolesTable', 'idField');
					return Q.when(knex.raw(query))
							.then(function (results) {
								return results[0];
							},
							function (err) {
								throw new Error(err);
							});
				}
			});		
		}
	});

	exports.Builder = PermissionManager;
});

})(
  typeof define === 'function' && define.amd ? define : function(factory) { factory(require, exports);
});
