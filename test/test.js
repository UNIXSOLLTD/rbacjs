var RBAC = require('./../rbac.js');
var Q = require('q');

var config = { 
		'rbacjs': {
		adapter: 'mysql',
	        host: 'localhost',
	        port: 3306,
	        database: 'rbacjs_test',
	        password: '',
	        charset: 'utf8',
	        user: 'travis' 
	    },
	    rolesTable: {
	    	idField: 'id',
	        leftField: 'lft',
	        rightField: 'rght',
	        table: 'roles',
	        titleField: 'title',
	        descriptionField: 'description' 
	    },
	    userRolesTable: {
	    	assignmentDateField: 'assignmentDate',
	        userIdField: 'userID',
	        roleIdField: 'roleID',
	        table: 'userroles'
	    },
	    rolePermissionsTable: {
	    	assignmentDateField: 'assignmentDate',
	        table: 'rolepermissions',
	        roleIdField: 'roleID',
	        permissionIdField: 'permissionID'
	    },
	    permissionsTable: {
	    	idField: 'id',
	        leftField: 'lft',
	        rightField: 'rght',
	        table: 'permissions',
	        titleField: 'title',
	        descriptionField: 'description'
	    } 
    };

var assert = require('assert');

describe("RBAC", function() {
	describe("initialize", function() {
		it("should return function", function () {
			var rb = RBAC.initialize(config);
			var type = typeof rb;
			type.should.equal('function');
		})
	})

	describe("reset", function() {
		it("should reset the DB to initial state and return true", function(){
			var rb = RBAC.initialize(config);
			Q.all(rb.reset(true)).then(function (rest) {
				rest.should.equal(true);
			});
		})
	})

	describe("rbac.check(perm, userId)", function() {
		it("should check for userId having perm and return true", function(){
			var rb = RBAC.initialize(config);
			Q.all(rb.check(1,1)).then(function (rest) {
				rest.should.equal(true);
			});
		})
	})

	describe("rbac('users').count()", function() {
		it("should return the amount of user-roles relations", function(){
			var rb = RBAC.initialize(config);
			Q.all(rb('users').count()).then(function (rest) {
				rest.should.equal(1);
			});
		})
	})

	describe("rbac('roles').count()", function() {
		it("should return the amount of roles", function(){
			var rb = RBAC.initialize(config);
			Q.all(rb('roles').count()).then(function (rest) {
				rest.should.equal(1);
			});
		})
	})

	describe("rbac('permissions').count()", function() {
		it("should return the amount of permissions", function(){
			var rb = RBAC.initialize(config);
			Q.all(rb('permissions').count()).then(function (rest) {
				rest.should.equal(1);
			});
		})
	})

	describe("rbac('permissions').add(perm, userId)", function() {
		it("should add a new perm to userId", function(){
			var rb = RBAC.initialize(config);
			Q.all(rb('permissions').add(2,1)).then(function (rest) {
				rest.should.equal(2);
			});
		})
	})

	describe("reset", function() {
		it("should reset the DB to initial state and return true", function(){
			var rb = RBAC.initialize(config);
			Q.all(rb.reset(true)).then(function (rest) {
				rest.should.equal(true);
			});
		})
	})
})
