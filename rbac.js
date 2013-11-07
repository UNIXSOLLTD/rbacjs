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
        var c = require('validator').check;
        var s = require('validator').sanitize;
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
                var noderbac = config['rbacjs'];
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
                return table ? builder : rbacjs;
            }

            // Private functions
            /**
             * Assign a role to a permission.
             * Alias for what's in the base class
             *
             * @param string|integer $Role
             *          path or string title or integer id
             * @param string|integer $Permission
             *          path or string title or integer id
             * @return boolean
             */
            rbacjs.assign = function(role, permission) {
                var permissionId = null;
                var roleId = null;
                var promises = [];
                
                try {
                    if (c(permission).isInt()) {
                        permissionId = permission;
                    }
                } catch (e) {
                    if (permission.substr(0,1) == "/") {
                        permissionId = rbacjs('permissions').pathId(permission);
                    } else {
                        permissionId = rbacjs('permissions').titleId(permission);
                    }
                }

                try {
                    if (c(role).isInt()) {
                        roleId = role;
                    }
                } catch (e) {
                    if (role.substr(0,1) == "/") {
                        roleId = rbacjs('roles').pathId(role);
                    } else {
                        roleId = rbacjs('roles').titleId(role);
                    }
                }

                promises.push(permissionId);
                promises.push(roleId);

                return Q.all(promises).spread(function (perm, rle) {
                    return rbacjs('roles').assign(perm, rle);
                });
            };

            rbacjs.check = function (permission, userId) {
                var knex = Knex.knex;
                var permissionId = null;

                if (undefined === userId) {
                    throw new Error('userId is a required argument');
                }

                try {
                    if (c(permission).isInt()) {
                        permissionId = permission;
                    }
                } catch (e) {
                    if (permission.substr(0,1) == "/") {
                        permissionId = rbacjs('permissions').pathId('permissionsTable', permission);
                    } else {
                        permissionId = rbacjs('permissions').titleId('permissionsTable', permission);
                    }
                }

                return Q.when(permissionId)
                        .then(function (perm) {
                            if (null === perm) {
                                throw new Error("The permission "+permission+" not found");
                            }

                            var query = "SELECT COUNT(*) AS Result "
                                        +"FROM "+config['userRolesTable']['table']+" AS TUrel "
                                        +"JOIN "+config['rolesTable']['table']+" AS TRDirect ON (TRDirect."
                                        +config['rolesTable']['idField']+"=TUrel."+config['userRolesTable']['roleIdField']+") "
                                        +"JOIN "+config['rolesTable']['table']+" AS TR ON (TR."
                                        +config['rolesTable']['leftField']+" BETWEEN TRDirect."+config['rolesTable']['leftField']+" AND TRDirect."+config['rolesTable']['rightField']+") "
                                        +"JOIN ("
                                            +config['permissionsTable']['table']+" AS TPdirect "
                                            +"JOIN "+config['permissionsTable']['table']+" AS TP ON (TPdirect."+config['permissionsTable']['leftField']
                                                +" BETWEEN TP."+config['permissionsTable']['leftField']+" AND TP."+config['permissionsTable']['rightField']+") "
                                            +"JOIN "+config['rolePermissionsTable']['table']+" AS TRel ON (TP."+config['permissionsTable']['idField']+"=TRel."
                                                +config['rolePermissionsTable']['permissionIdField']+")"
                                        +") ON (TR."+config['rolesTable']['idField']+"=TRel."+config['rolePermissionsTable']['roleIdField']+") "
                                        +"WHERE TUrel."+config['userRolesTable']['userIdField']+"="+userId
                                        +" AND TPdirect."+config['permissionsTable']['idField']+"="+perm;
                            return Q.when(knex.raw(query))
                                    .then(function (result) {
                                        return 1 <= result[0][0].Result;
                                    },
                                    function (err) {
                                        throw new Error('Can not run query: '+err);
                                    });
                        });
            };

            rbacjs.enforce = function (permission, user_id) {
                console.log('Not yet implemented');
            };

            rbacjs.reset = function (ensure) {
                var promises=[];
                if (true !== ensure) {
                    throw new Error('RBAC.reset requires a parameter in order to confirm the operation.');
                }

                return Q.when(rbacjs('roles').resetAssignments(true))
                        .then(function () {
                            return Q.when(rbacjs('roles').reset(true))
                                    .then(function () {
                                        return Q.when(rbacjs('permissions').reset(true))
                                                .then(function () {
                                                    return Q.when(rbacjs('users').resetAssignments(true))
                                                            .then(function () {
                                                                return true;
                                                            },
                                                            function (err) {
                                                                throw new Error("Can not reset user assignments", err);
                                                            });
                                                },
                                                function (err) {
                                                    throw new Error("Can not reset permissions", err);
                                                });
                                    },
                                    function (err) {
                                        throw new Error("Can not reset roles", err);
                                    });
                        },
                        function (err) {
                            throw new Error("Can not reset role assignments", err);
                        });
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