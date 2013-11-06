/**
 * Common Class
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
	var extend = require('extendable');

	exports.Common = {
		// Creates a new instance of the current `Builder`,
	    // with the correct current `rbac` instance.
	    instance: function() {
	      var builder = new this.constructor(this.rbac);
	          builder.table = this.table;
	      return builder;
	    },

	    type: function() {
			return this.get('type');
		},

		// Sets `options` which are passed along.
	    options: function(opts) {
	      this.flags.options = _.extend({}, this.flags.options, opts);
	      return this;
	    },

		/**
		 * Gets property.
		 */
		get: function (property, def) {
			var prop = this.properties[property];
			if (undefined !== prop)
			{
				return prop;
			}

			return def;
		},

		/**
		 * Checks if a property exists.
		 */
		has: function (property) {
			return (undefined !== this.properties[property]);
		},

		/**
		 * Sets properties.
		 */
		set: function (properties, value) {
			if (undefined !== value)
			{
				var property = properties;
				properties = {};
				properties[property] = value;
			}

			var previous = {};

			var model = this;
			_.each(properties, function (value, key) {
				if (undefined === value)
				{
					return;
				}

				var prev = model.get(key);

				// New value.
				if (value !== prev)
				{
					previous[key] = prev;
					model.properties[key] = value;
				}
			});

			if (!_.isEmpty(previous))
			{
				this.emit('change', previous);

				_.each(previous, function (previous, property) {
					this.emit('change:'+ property, previous);
				}, this);
			}
		},

		/**
		 * Unsets properties.
		 */
		unset: function (properties) {
			// @todo Events.
			this.properties = _.omit(this.properties, properties);
		},

		getField: function(table, id) {
			var tbl = this.config[table];

			if (!tbl) {
				return null;
			} else {
				if (!tbl[id]) {
					return null;
				}
				return tbl[id];
			}
		},

		// Default handler for a response is to pass it along.
	    handleResponse: function(resp) {
	      //console.log(arguments);
	      if (this && this.grammar && this.grammar.handleResponse) {
	        return this.grammar.handleResponse(this, resp);
	      }
	      return resp;
	    },

		/**
		 * Default properties.
		 *
		 * @type {Object}
		 */
		'default': {},

		extend: extend,
	}
});


})( // End First closure
  typeof define === 'function' && define.amd ? define : function (factory) { factory(require, exports); }
);