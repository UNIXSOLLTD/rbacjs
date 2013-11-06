/*
 *  rolemodel.js 
 *  RBAC Role Manager
 *  it has specific functions to the roles
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

	/**
	 * Roles Nested Set
	 *
	 * @var ExtendedNestedSet
	 */
	var RoleModelBuilder = function (config) {
		var self = this;
		
		this.config = config;
		this.knex = require("knex").knex;
		
		_.extend(this, config['rolesTable']);
		
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

		this.nestedSet = new ExtendedNestedSet(config['rolesTable']);
	};

	_.extend(RoleModelBuilder.prototype, RbacBase, {
		// Private functions
		/**
		 * Remove a role from system
		 *
		 * @param integer id
		 *        	role id
		 * @param boolean recursive
		 *        	delete all descendants
		 *
		 */
		remove: function (id, recursive) {
			var self=this;
			var promises = [];

			promises.push(this.unassignPermissions(id));
			promises.push(this.unassignUsers(id));

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
		 * Unassigns all permissions belonging to a role
		 *
		 * @param integer id
		 *        	role ID
		 * @return integer number of assignments deleted
		 */
		unassignPermissions: function (id)
		{
			return Q.when(knex(this.getField('rolePermissionsTable', 'table')).where(this.getField('rolePermissionsTable', 'roleIdField'), id).del()).then(function (ids) {
				return ids;
			},
		 	function (err) {
		 		throw new Error(err);
		 	});
		},

		/**
		 * Unassign all users that have a certain role
		 *
		 * @param integer $ID
		 *        	role ID
		 * @return integer number of deleted assignments
		 */
		 unassignUsers: function(id) {
		 	return Q.when(knex(this.getField('userRolesTable', 'table')).where(this.getField('userRolesTable', 'roleIdField'), id).del()).then(function (ids) {
		 		return ids;
		 	},
		 	function (err) {
		 		console.log(err);
		 		throw new Error(err);
		 	})
		 },

		/**
		 * Checks to see if a role has a permission or not
		 *
		 * @param integer role
		 *        	ID
		 * @param integer permission
		 *        	ID
		 * @return boolean
		 *
		 * @todo: If we pass a Role that doesn't exist the method just returns false. We may want to check for a valid Role.
		 */
		hasPermission: function(role, permission) {
			var cfg = this.get('config');

			var rolepermissions = cfg.get('rolePermissionsTable', 'table');
			var permissions = cfg.get('permissionsTable', 'table');
			var ptId = cfg.get('permissionsTable', 'idField');
			var ptLeft = cfg.get('permissionsTable', 'leftField');
			var ptRight = cfg.get('permissionsTable', 'rightField');
			var rpPermissionId = cfg.get('rolePermissionsTable', 'permissionIdField');
			var trLeft = cfg.get('rolesTable', 'leftField');
			var trRight = cfg.get('rolesTable', 'rightField');
			var trId = cfg.get('rolesTable', 'idField');
			var roles = cfg.get('rolesTable', 'table');

			var query = "SELECT COUNT(*) AS Result "
						+"FROM "+rolepermissions+" AS TRel "
						+"JOIN "+permissions+" AS TP ON (TP."+ptId+"=TRel."+rpPermissionId+") "
						+"JOIN "+roles+" AS TR ON (TR."+trId+"=TRel."+rpPermissionId+") "
						+"WHERE TR."+trLeft+" BETWEEN "
						+"(SELECT "+trLeft+" FROM "+roles+" WHERE "+trId+"="+role+") "
						+"AND "
						+"(SELECT "+trRight+" FROM "+roles+" WHERE "+trId+"="+role+") "
						// the above section means any row that is a descendants of our role 
						// (if descendant roles have some permission, then our role has it two)
						+" AND TP."+ptId+" IN ( "
							+"SELECT parent."+ptId+" "
							+"FROM "+permissions+" AS node, "
							+""+permissions+" AS parent "
							+"WHERE node."+ptLeft+" BETWEEN parent."+ptLeft+" AND parent."+ptRight+" "
							+"AND node."+ptId+"="+permission+" "
							+"ORDER BY parent."+ptLeft
						+")";
						/*
						the above section returns all the parents of (the path to) our permission, so if one of our role or its descendants
						has an assignment to any of them, we're good.
						*/
			return Q.when(knex.raw(query).then(function (result) {
				console.log(result);
				return (1 <= result[0].Result);
			},
			function (err) {
				console.log(err);
				throw new Error(err);
			}));

		},

		/**
		 * Returns all permissions assigned to a role
		 *
		 * @param integer role
		 *        	ID
		 * @param boolean onlyIDs
		 *        	if true, result would be a 1D array of IDs
		 * @return Array 2D or 1D or null
		 *         the two dimensional array would have ID,Title and Description of permissions
		 */
		permissions: function (role, onlyIds) {
			var promise;
			var rolepermissions = this.getField('rolePermissionsTable', 'table');
			var ptId = this.getField('permissionsTable', 'idField');

			if (undefined === onlyIds) {
				return Q.when(knex(rolepermissions)
								.where(rpId, role)
								.orderBy(rpPermissionId)
								.select(knex.raw(rpPermissionId+" AS ID"))
								.then(function (results) {
									var result = [];
									if (_.isArray(results)) {
										_.each(returns, function (res) {
											result.push(res.ID);
										});
										return result;
									} else {
										return null;
									}
								},
								function (err) {
									console.log(err);
								}))
						.then(function (results) {
							return results;
						});
			} else {
				var query = "SELECT TP.* FROM"+rolepermissions+" AS TR "
							+"RIGHT JOIN "+permissions+" AS TP ON (TR."+rpPermissionId+"=TP."+ptId+")"
							+"WHERE "+rpRoleId+"="+role+" ORDER BY TP."+ptPermissionId;
				return Q.when(
						knex.raw(query)
						.then(function (results) {
							return results;
						},
						function (err) {

						})
					)
					.then(function (results) {
						return results;
					});
			}
		},
	}); // End module extend

	exports.Builder = RoleModelBuilder;

	RoleModelBuilder.initialize = function (config) {
		return RoleModelBuilder(config);
	}

});

})(
  typeof define === 'function' && define.amd ? define : function(factory) { factory(require, exports);
});
