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
	var RbacBase = require('./../rbacbase').RbacBase;
	var ExtendedNestedSet = require('./../helpers/extendednestedset').ExtendedNestedSet;
	var c = require('validator').check;
	var s = require('validator').sanitize;

	var RBACUserModel = function(config) {
		var self = this;

		RBACUserModel.super_.call(this, config);
		RBACUserModel.knex = require("knex").knex;
		RBACUserModel.users = new extendedNestedSet(config.get('userRolesTable'));
		RBACUserModel.config = config;
	}
	require('util').inherits(RBACUserModel, RbacBase);


	// Private functions
	RBACUserModel.prototype.type = function() {
		return this._get('type');
	}

	RBACUserModel.prototype.getField = function(table, id) {
		var table = this.get(table);
		var prop = table[id];
		
		if (undefined !== prop)
		{
			return prop;
		}
		return null;
	}

	RBACUserModel.prototype.getIdField = function() {
		return this._get('idField');
	}

	RBACUserModel.prototype.getTableField = function() {
		return this._get('table');
	}

	RBACUserModel.prototype.getLeftField = function() {
		return this._get('leftField');
	}

	RBACUserModel.prototype.getRightField = function() {
		return this._get('rightField');
	}

	RBACUserModel.prototype.getDescriptionField = function() {
		return this._get('descriptionField');
	}

	RBACUserModel.prototype.getTitleField = function() {
		return this._get('titleField');
	}

	RBACUserModel.prototype.getRolesField = function() {
		return this._get('rolesField');
	}

	RBACUserModel.prototype.getRoleIdField = function() {
		return this._get('roleIdField');
	}

	RBACUserModel.prototype.getUserIdField = function() {
		return this._get('userIdField');
	}
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
	RBACUserModel.prototype.hasRole = function(role, userId) {
		var knex  = this.knex;
		var trbac = this.rbac;

		var table = this.getTableField();
		var roles = this.getRolesField();
		var left  = this.getLeftField();
		var right = this.getRightField();
		var tid   = this.getIdField();
		var rId   = this.getRoleIdField();
		var uId   = this.getUserIdField();

		var roleId;

		if (undefined === userId) {
			throw new Error("userId is a required argument");
		}

		try {
			if (c(role).isInt()) {
				roleId = role;
			}
		} catch (e) {
			console.log(e);
			if (role.substr(0,1) == "/") {
				console.log('role is a path. Getting ID');
				roleId = trbac.roles.pathId(role);
			} else {
				console.log('role is title. Getting ID');
				roleId = trbac.roles.titleId(role);
			}
		}

		var query = "SELECT * FROM "+table+" AS TUR "
					+"JOIN "+roles+" AS TRdirect ON (TRdirect."+tid+"=TUR."+rId+") "
					+"JOIN "+roles+" AS TR ON (TR."+left+" BETWEEN TRdirect."+left+" AND TRdirect."+right+") "
					+"WHERE TUR."+uId+"="+userId+" AND TR."+uId+"="+roleId;

		console.log("RBAC User Module Query: "+query);
		
		return Q.when(knex.raw(query).then(function (result) {
			return _.isObject(result[0]);
		}));
	}

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
	RBACUserModel.prototype.assign = function(role, userId) {
		var self = this;
		var userroles = this.getField('userRolesTable', 'table');
		var urUserId = this.getField('userRolesTable', 'userIdField');
		var urRoleId = this.getField('userRolesTable', 'roleIdField');
		var urAssignmentDate = this.getField('userRolesTable', 'assignmentDateField');

		if (undefined == userId) {
			throw new Error('userId is a required argument.');
		}

		try {
			if (c(role).isInt()) {
				roleId = Q(role);
			}
		} catch (e) {
			console.log(e);
			if (role.substr(0,1) == "/") {
				console.log('role is a path. Getting ID');
				roleId = self.roles.pathId(role);
			} else {
				console.log('role is title. Getting ID');
				roleId = self.roles.titleId(role);
			}
		}
		
		var ins = {};
		ins[urUserId] = userId;
		ins[urRoleId] = roleId;
		ins[urAssignmentDate] = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''); // @todo: use of nodejs library maybe?!

		return Q.when(roleId)
				.then(function (roleIdValue) {
					Q.when(knex(userroles).insert(ins).then(function (result) {
							return (result >= 1);
						},
						function (err) {
							throw new Error('Can\'t assign role '+role+' to user '+userId);
						})
					).then (function (result) {
							return result;
						},
						function (err) {
							console.log(err);
						})
				},
				function (err) {
					console.log(err);
				});
	}
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
	RBACUserModel.prototype.unassign = function(role, userId) {

	}
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
	RBACUserModel.prototype.allRoles = function (userId) {

	 }

	 /**
	 * Return count of roles for a user
	 *
	 * @param integer userId
	 *
	 * @throws RbacUserNotProvidedException
	 * @return integer
	 */
	RBACUserModel.prototype.rolesCount = function(userId) {

	 }

	 /**
	 * Remove all role-user relations
	 * mostly used for testing
	 *
	 * @param boolean ensure
	 *        	must set or throws error
	 * @return number of deleted relations
	 */
	 RBACUserModel.prototype.resetAssignments = function (ensure) {

	 }

	 RBACUserModel.prototype._get = function(property, def) {
		var prop = this.properties[property];
		if (undefined !== prop)
		{
			return prop;
		}
		return def;
	}

	RBACUserModel.prototype._set = function(property, val) {
		this.properties[property] = val;
	}
	/*
	class RBACUserManager extends JModel
	{
		function Assign($Role, $UserID = null)
		{
		   if ($UserID === null)
			    throw new \RbacUserNotProvidedException ("\$UserID is a required argument.");

			if (is_int ( $Role ))
			{
				$RoleID = $Role;
			}
			else
			{
				if (substr ( $Role, 0, 1 ) == "/")
					$RoleID = jf::$RBAC->Roles->PathID ( $Role );
				else
					$RoleID = jf::$RBAC->Roles->TitleID ( $Role );
			}
			$res = jf::SQL ( "INSERT INTO {$this->tablePrefix()}userroles
					(UserID,RoleID,AssignmentDate)
					VALUES (?,?,?)
					", $UserID, $RoleID, jf::time () );
			return $res >= 1;
		}
		function Unassign($Role, $UserID = null)
		{
		   if ($UserID === null)
			    throw new \RbacUserNotProvidedException ("\$UserID is a required argument.");

			return jf::SQL ( "DELETE FROM {$this->tablePrefix()}userroles
			WHERE UserID=? AND RoleID=?", $UserID, $Role ) >= 1;
		}
		function AllRoles($UserID = null)
		{
		   if ($UserID === null)
			    throw new \RbacUserNotProvidedException ("\$UserID is a required argument.");

			return jf::SQL ( "SELECT TR.*
				FROM
				{$this->tablePrefix()}userroles AS `TRel`
				JOIN {$this->tablePrefix()}roles AS `TR` ON
				(`TRel`.RoleID=`TR`.ID)
				WHERE TRel.UserID=?", $UserID );
		}
		function RoleCount($UserID = null)
		{
			if ($UserID === null)
			    throw new \RbacUserNotProvidedException ("\$UserID is a required argument.");

			$Res = jf::SQL ( "SELECT COUNT(*) AS Result FROM {$this->tablePrefix()}userroles WHERE UserID=?", $UserID );
			return (int)$Res [0] ['Result'];
		}	
		function ResetAssignments($Ensure = false)
		{
			if ($Ensure !== true)
			{
				throw new \Exception ("You must pass true to this function, otherwise it won't work.");
				return;
			}
			$res = jf::SQL ( "DELETE FROM {$this->tablePrefix()}userroles" );

			$Adapter = get_class(jf::$Db);
			if ($this->isMySql())
				jf::SQL ( "ALTER TABLE {$this->tablePrefix()}userroles AUTO_INCREMENT =1 " );
			elseif ($this->isSQLite())
				jf::SQL ( "delete from sqlite_sequence where name=? ", $this->tablePrefix () . "_userroles" );
			else
				throw new \Exception ("RBAC can not reset table on this type of database: {$Adapter}");
			$this->Assign ( "root", 1 ); // root user  
			return $res;
		}
	*/
	exports.Client = RBACUserModel;

	RBACUserModel.initialize = function(config) {
		return new RBACUserModel(config);
	}
});

})(
  typeof define === 'function' && define.amd ? define : function(factory) { factory(require, exports);
});