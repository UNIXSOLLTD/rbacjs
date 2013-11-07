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
			return Q.when(knex(this.getField('rolePermissionsTable', 'table')).where(this.getField('rolePermissionsTable', 'roleIdField'), id).del())
					.then(function (ids) {
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

		 	return Q.when(knex(this.getField('userRolesTable', 'table')).where(this.getField('userRolesTable', 'roleIdField'), id).del())
		 			.then(function (ids) {
				 		return ids;
				 	},
				 	function (err) {
				 		console.log(err);
				 		throw new Error(err);
				 	});
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
			
			var rolepermissions = this.getField('rolePermissionsTable', 'table');
			var permissions = this.getField('permissionsTable', 'table');
			var ptId = this.getField('permissionsTable', 'idField');
			var ptLeft = this.getField('permissionsTable', 'leftField');
			var ptRight = this.getField('permissionsTable', 'rightField');
			var rpPermissionId = this.getField('rolePermissionsTable', 'permissionIdField');
			var trLeft = this.getField('rolesTable', 'leftField');
			var trRight = this.getField('rolesTable', 'rightField');
			var trId = this.getField('rolesTable', 'idField');
			var roles = this.getField('rolesTable', 'table');

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
				result = result[0];
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
			var rpId = this.getField('rolePermissionsTable', 'roleIdField');
			var rpPermissionId = this.getField('rolePermissionsTable', 'permissionIdField');
			var rpRoleId = this.getField('rolePermissionsTable', 'roleIdField');
			var ptId = this.getField('permissionsTable', 'idField');
			var ptPermissionId = this.getField('permissionsTable', 'permissionIdField');
			var permissions = this.getField('permissionsTable', 'table');

			if (undefined === onlyIds) {
				return Q.all(knex(rolepermissions)
								.where(rpId, role)
								.orderBy(rpPermissionId)
								.select(knex.raw(rpPermissionId+" AS ID"))
							)
						.then(function (results) {
									console.log(results);
									var result = [];
									if (_.isArray(results)) {
										_.each(results, function (res) {
											result.push(res.ID);
										});
										return result;
									} else {
										return null;
									}
								},
								function (err) {
									throw new Error(err);
								});
			} else {
				var query = "SELECT TP.* FROM "+rolepermissions+" AS TR "
							+"RIGHT JOIN "+permissions+" AS TP ON (TR."+rpPermissionId+"=TP."+ptId+") "
							+"WHERE "+rpRoleId+"="+role+" ORDER BY TP."+ptId;
				return Q.when(knex.raw(query))
						.then(function (results) {
							return results[0];
						},
						function (err) {
							throw new Error(err);
						});
			}
		},

		/**
		 * Remove all role-permission relations
		 * mostly used for testing
		 *
		 * @param boolean ensure
		 *        	must set or throws error
		 * @return number of deleted relations
		 */
		resetAssignments: function (ensure) {
			var knex = this.knex;
			var self = this;
			var table = this.getField('rolePermissionsTable', 'table');
			
			var promises = [];
			if (true !== ensure) {
				throw new Error('You must pass true to this function, otherwise it won\'t work');
			}

			return Q.when(knex(table).del()).then(function (deleted) {
						return Q.when(knex.raw("ALTER TABLE "+table+" AUTO_INCREMENT=1"))
								.then(function () {
									return Q.when(self.assign(self.rootId(), self.rootId()))
											.then(function () {
												return 0 <= deleted;
											},
											function (err) {
												throw new Error("Add new entry Exception: "+err);
											});
								},
								function (err) {
									throw new Error("Can't reset AUTO_INCREMENT field"+err);
								});
					},
					function (err) {
						throw new Error(err);
					});
		}
	}); // End module extend

	exports.Builder = RoleModelBuilder;

	RoleModelBuilder.initialize = function (config) {
		return RoleModelBuilder(config);
	}
});

})(
  typeof define === 'function' && define.amd ? define : function(factory) { factory(require, exports);
});
