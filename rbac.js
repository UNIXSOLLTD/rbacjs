/*
 *  Provides NIST Level 2 Standard Role Based Access Control functionality
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
 *  @defgroup rbac-node RBAC Functionality
 *  @{
 *  Documentation for all node-rbac related functionality.
 */
(function(define) {

    "use strict";

    define(function(require, exports, module) {

        var _ = require('underscore');
        var Q = require('q');
        var Knex = require('knex');
        var Common = require('./lib/common').Common;
        
        var RBACJS = function(config)
        {
            var rbacjs = function(table) {
                return rbacjs.builder(table);
            }

            if (!Knex.knex) {
                var noderbac = config['node-rbac'];
                var knexoptions = {
                    client: noderbac.adapter,
                    connection: 
                    {
                        host: noderbac.host,
                        user: noderbac.user,
                        password: noderbac.password,
                        database: noderbac.database,
                        port: noderbac.port,
                        charset: noderbac.charset,
                    }
                }
                Knex.knex = Knex.initialize(knexoptions);
            }
            
            rbacjs.builder = function(table) {
                if (!Clients[table]) {
                    throw new Error('Unsupported class! Accepted values: users, roles, permissions');
                }
                var Dialect = require(Clients[table]).Builder;
                var builder = new Dialect(config);
                return table ? builder : this;
            }

            // Private functions
            rbacjs.assign = function(role, permission) {
                console.log('Not yet implemented');
            };

            rbacjs.check = function (permission, user_id) {
                console.log('Not yet implemented');
            };
            rbacjs.enforce = function (permission, user_id) {
                console.log('Not yet implemented');
            };

            rbacjs.reset = function (ensure) {
                if (ensure === undefined) {
                    throw new Error('RBAC.reset requires a parameter in order to confirm the operation.');
                }
                return 'Success';
                //return jf::$RBAC->Reset($ensure);
            };

            return rbacjs;
        }

        // The client names we'll allow in the `{name: lib}` pairing.
        var Clients = RBACJS.Clients = {
            'users'       : './lib/helpers/usermodel',
            'roles'       : './lib/helpers/rolemodel',
            'permissions' : './lib/helpers/permissionmodel',
        }

        RBACJS.extend = require('extendable');
        module.exports = RBACJS;

        /** @} */ // End group node-rbac */
        RBACJS.initialize = function(config) {
            return RBACJS(config);
        }
    });
})(
  typeof define === 'function' && define.amd ? define : function (factory) { factory(require, exports, module); }
);