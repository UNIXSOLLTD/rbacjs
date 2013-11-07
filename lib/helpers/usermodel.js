/**
 *  usermodel.js
 *  RBAC User Model
 *  holds specific operations for users
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
	var ExtendedNestedSet = require('./../extendednestedset').ExtendedNestedSet;
	var c = require('validator').check;
	var s = require('validator').sanitize;

	var RBACUserModel = function(config) {
		var self = this;

		
		this.knex = require("knex").knex;
		this.config = config;

		_.extend(this, config['userRolesTable']);
		
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

		this.nestedSet = new ExtendedNestedSet(config['userRolesTable']);
	}

	_.extend(RBACUserModel.prototype, RbacBase, {
		
		// Private functions

		/* 
		 * Get the ID field of the table
		 *
		 * @return String Name of the ID field in the table
		 */
		getIdField: function() {
			return this.idField;
		},

		/* 
		 * Get the name of the table
		 *
		 * @return String Name of the table
		 */
		getTableField: function() {
			return this.table;
		},

		/* 
		 * Get the name of the Left field in the table
		 *
		 * @return String Name of the Left field in the table
		 */
		getLeftField: function() {
			return this.leftField;
		},

		/* 
		 * Get the name of the Right field in the table
		 *
		 * @return String Name of the Right field in the table
		 */
		getRightField: function() {
			return this.rightField;
		},

		/* 
		 * Get the name of the Description field in the table
		 *
		 * @return String Name of the Description field in the table
		 */
		getDescriptionField: function() {
			return this.descriptionField;
		},

		/* 
		 * Get the name of the Title field in the table
		 *
		 * @return String Name of the Title field in the table
		 */
		getTitleField: function() {
			return this.titleField;
		},

		/**
		 * Checks to see whether a user has a role or not
		 *
		 * @param integer|string role
		 *        	id, title or path
		 * @param integer user
		 *        	userId, not optional
		 *
		 * @throws RbacUserNotProvidedException
		 * @return boolean success
		 */
		hasRole: function(role, userId) {
			var knex  = this.knex;
			var trbac = this.rbac;

			var table    = this.getTableField();
			var roles    = this.getField('rolesTable', 'table');
			var left     = this.getField('rolesTable', 'leftField');
			var right    = this.getField('rolesTable', 'rightField');
			var rId      = this.getField('rolesTable', 'idField');
			var urRoleId = this.getField('userRolesTable', 'roleIdField');
			var uId      = this.getField('userRolesTable', 'userIdField');

			var roleId;

			if (undefined === userId) {
				throw new Error("userId is a required argument");
			}

			try {
				if (c(role).isInt()) {
					roleId = role;
				}
			} catch (e) {
				if (role.substr(0,1) == "/") {
					console.log('role is a path. Getting ID');
					roleId = self.pathId('rolesTable', role);
				} else {
					console.log('role is title. Getting ID');
					roleId = self.titleId('rolesTable', role);
				}
			}

			var query = "SELECT * FROM "+table+" AS TUR "
						+"JOIN "+roles+" AS TRdirect ON (TRdirect."+rId+"=TUR."+urRoleId+") "
						+"JOIN "+roles+" AS TR ON (TR."+left+" BETWEEN TRdirect."+left+" AND TRdirect."+right+") "
						+"WHERE TUR."+uId+"="+userId+" AND TR."+rId+"="+roleId;

			return Q.when(knex.raw(query).then(function (result) {
				return _.isObject(result[0]);
			}));
		},

		/**
		 * Assigns a role to a user
		 *
		 * @param integer|string role
		 *        	id or path or title
		 * @param integer userId
		 *        	UserId (use 0 for guest)
		 *
		 * @throws RbacUserNotProvidedException
		 * @return inserted or existing
		 */
		assign: function(role, userId) {
			var self = this;
			var knex = this.knex;
			var userroles = this.getField('userRolesTable', 'table');
			var urUserId = this.getField('userRolesTable', 'userIdField');
			var urRoleId = this.getField('userRolesTable', 'roleIdField');
			var urAssignmentDate = this.getField('userRolesTable', 'assignmentDateField');
			var roleId = null;

			if (undefined === userId) {
				throw new Error('userId is a required argument.');
			}

			try {
				if (c(role).isInt()) {
					roleId = role;
				}
			} catch (e) {
				if (role.substr(0,1) == "/") {
					roleId = self.pathId('rolesTable', role);
				} else {
					roleId = self.titleId('rolesTable', role);
				}
			}
			
			return Q.when(roleId)
					.then(function (roleIdValue) {
						if (null === roleIdValue) {
							throw new Error('The provided role is not available.')
						}
						var ins = {};
						ins[urUserId] = userId;
						ins[urRoleId] = roleIdValue;
						ins[urAssignmentDate] = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''); // @todo: use of nodejs library maybe?!
						
						return Q.when(knex(userroles).insert(ins))
								 .then(function (result) {
								 		console.log(result[0]);
										return (result[0] >= 1);
									},
									function (err) {
										throw new Error('Can\'t assign role '+role+' to user '+userId);
									});
					},
					function (err) {
						throw new Error(err);
					});
		},
		/**
		 * Unassigns a role from a user
		 *
		 * @param integer role
		 *        	ID
		 * @param integer userId
		 *        	UserId (use 0 for guest)
		 *
		 * @throws RbacUserNotProvidedException
		 * @return boolean success
		 */
		unassign: function(role, userId) {
			var knex = this.knex;
			var userroles = this.getField('userRolesTable', 'table');
			var urRoleId = this.getField('userRolesTable', 'roleIdField');
			var urUserId = this.getField('userRolesTable', 'userIdField');

			if (undefined === userId) {
				throw new Error("userId is a required argument");
			}

			return Q.when(knex(userroles).where(urUserId, userId).andWhere(urRoleId, role).del())
					.then(function (result) {
						return result >= 1;
					},
					function (err) {
						throw new Error(err);
					});
		},

		/**
		 * Returns all roles of a user
		 *
		 * @param integer $UserID
		 *        	Not optional
		 *
		 * @throws RbacUserNotProvidedException
		 * @return array null
		 *
		 */
		allRoles: function (userId) {
			var knex = this.knex;
			var userroles = this.getField('userRolesTable', 'table');
			var roles = this.getField('rolesTable', 'table');
			var urRoleId = this.getField('userRolesTable', 'roleIdField');
			var urUserId = this.getField('userRolesTable', 'userIdField');
			var rId = this.getField('rolesTable', 'idField');

			if (undefined === userId) {
				throw new Error("userId is a required argument");
			}

			var query = "SELECT TR.* "
						+"FROM "+userroles+" AS `TRel` "
						+"JOIN "+roles+" AS `TR` ON (`TRel`."+urRoleId+"=`TR`."+rId+") "
						+"WHERE `TRel`."+urUserId+"="+userId;

			return Q.when(knex.raw(query))
					.then(function (results) {
						console.log(results[0]);
						return results[0];
					},
					function (err) {
						throw new Error(err);
					});
		},

		/**
		 * Return count of roles for a user
		 *
		 * @param integer userId
		 *
		 * @throws RbacUserNotProvidedException
		 * @return integer
		 */
		roleCount: function(userId) {
			var knex = this.knex;
			var self = this;

			if (undefined === userId) {
				throw new Error("userId is a required argument");
			}

			return Q.all(knex(self.table).where(self.userIdField, userId).select(knex.raw("COUNT(*) AS `Result`")))
					.then(function (result) {
						if (!_.isEmpty(result)) {
							return result[0].Result;
						}
						return null;
					},
					function (err) {
						throw new Error(err);
					})
		},

		/**
		 * Remove all role-user relations
		 * mostly used for testing
		 *
		 * @param boolean ensure
		 *        	must set or throws error
		 * @return number of deleted relations
		 */
		resetAssignments: function (ensure) {
			var knex = this.knex;
			var self = this;
			
			var promises = [];
			if (true !== ensure) {
				throw new Error('You must pass true to this function, otherwise it won\'t work');
			}

			promises.push(knex(this.table).del());
			promises.push(knex.raw("ALTER TABLE "+this.table+" AUTO_INCREMENT=1"));
			promises.push(this.assign('/', 1));

			return Q.all(promises).spread(function (deleted, alter, assignment) {
						return 1 <= deleted;
					},
					function (err) {
						throw new Error(err);
					});
		}
	}); // Model extend

	exports.Builder = RBACUserModel;

	RBACUserModel.initialize = function(config) {
		return new RBACUserModel(config);
	}
});

})(
  typeof define === 'function' && define.amd ? define : function(factory) { factory(require, exports);
});