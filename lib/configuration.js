var events = require("events");
var util = require("util");
var _ = require("underscore");
var Q = require("q");
var fs = require("fs");

function rbacConfiguration(options)
{
	var self = this;

	self.data = {};

	// default configuration
	self.merge({
		'node-rbac': {
			'adapter': 'mysql',
			'host': '0.0.0.0',
			'port': 3306,
			'database': 'node-rbac',
			'password': 'changeme',
			'charset': 'utf8',
			'user': 'node-rbac',
		},
		'basenestedset': {
			'idField': 'id',
			'leftField': 'lft',
			'rightField': 'rght',
		},
	});

	self.path = __dirname +'/../../config/local.yaml';
	self.pathdb = __dirname +'/../../config/database.yaml';

	if (_.isArray(options) && (undefined !== options.path)) {
		self.path = options.path;
	}

	if (_.isArray(options) && (undefined !== options.pathdb)) {
		self.pathdb = options.pathdb;
	}

	self.on('node-rbac initialize', function(config)
	{
		//console.log("node-rbac Initializing configuration: "+JSON.stringify(config));
	});

	self.on("node-rbac read file", function (file) 
	{
		console.log("node-rbac Reading file: "+file);
	});

	rbacConfiguration.super_.call(this);
}
require("util").inherits(rbacConfiguration, events.EventEmitter);

rbacConfiguration.prototype.get = function (path)
{
	/* jshint noempty: false */

	if (!_.isArray(path))
	{
		path = Array.prototype.slice.call(arguments);
	}

	var current = this.data;
	for (
		var i = 0, n = path.length;
		(i < n) && (undefined !== (current = current[path[i]]));
		++i
	)
	{}

	if (i < n)
	{
		return undefined;
	}

	return current;
}

rbacConfiguration.prototype.merge = function (data)
{
	var helper = function (target, source) {
		if (null === source) // Special case.
		{
			return target;
		}

		if (!_.isObject(target) || !_.isObject(source))
		{
			return source;
		}

		if (_.isArray(target) && _.isArray(source))
		{
			target.push.apply(target, source);
			return target;
		}

		for (var prop in source)
		{
			target[prop] = helper(target[prop], source[prop]);
		}
		return target;
	};

	helper(this.data, data);
	return this;
}

rbacConfiguration.prototype.read_file = function (file)
{
	this.emit('node-rbac read file', file);
	return Q.ninvoke(fs, 'readFile', file, {'encoding': 'utf-8'});
}

rbacConfiguration.prototype.initialize = function() {
	

	var self = this;
	var result;

	var promises=[];
	
	promises.push(self.read_file(self.path));
	promises.push(self.read_file(self.pathdb));

	return Q.all(promises).spread(
		function (local, db) {
			//console.log(''+local+" "+db);
			local = require('js-yaml').safeLoad(local);
			db = require('js-yaml').safeLoad(db);
			self.merge(local);
			self.merge(db);
			return self;
		},
		function (e) {
			console.error('[Warning] Reading config file: '+ e);
		}
	).then(function (cfg) {
	// Do a configuration sanitation and validation
		if (!cfg.get('node-rbac')) {
			throw new Error("node-rbac Configuration settings for node-rbac missing.");
		}
		self.emit('node-rbac initialize', cfg);
		return Q(cfg);
	});
}

rbacConfiguration.extend = require("extendable");
module.exports = rbacConfiguration;
