/*
 * grunt-wordpress-deploy
 * https://github.com/jambox/grunt-wordpress-deploy
 *
 * Copyright (c) 2016 Caliper
 * Licensed under the MIT license.
 */

'use strict';

module.exports = function(grunt) {

  grunt.initConfig({
    jshint: {
      all: [
        'Gruntfile.js',
        'tasks/*.js',
      ],
      options: {
        jshintrc: '.jshintrc',
      },
    },

    clean: {
      tests: ['tmp'],
    },

    wordpressdeploy: {
      options: {
        backups_dir: 'backups_dir/',
        rsync_args: ['--verbose', '--progress', '-rlpt', '--compress', '--omit-dir-times'],
        exclusions: ['.git', 'tmp/*', 'backups_dir/', 'wp-config.php', 'composer.json', 'composer.lock']
      },
      local: {
        title: 'local',
        database: 'db_local',
        user: 'user_local',
        pass: 'pass_local',
        host: 'host_local',
        url: 'url_local',
        path: 'path_local'
      },
      production: {
        title: 'staging',
        database: 'db_staging',
        user: 'user_staging',
        pass: 'pass_staging',
        host: 'host_staging',
        url: 'url_staging',
        path: 'path_staging',
        ssh_host: 'ssh_staging'
      }
    },


    coffee: {
      compile: {
        files: {
          'tasks/lib/util.js': 'tasks/lib/util.coffee'
        }
      },
    },

    nodeunit: {
      tasks: ['test/*_test.js']
    },

    watch: {
      scripts: {
        files: ['**/*.coffee'],
        tasks: ['coffee'],
        options: {
          spawn: false,
        },
      },
    },

  });

  grunt.loadTasks('tasks');

  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-clean');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-contrib-coffee');
  grunt.loadNpmTasks('grunt-contrib-watch');

  // Whenever the "test" task is run, first clean the "tmp" dir, then run this
  // plugin's task(s), then test the result.
  grunt.registerTask('test', ['clean', 'nodeunit']);

  // By default, lint and run all tests.
  grunt.registerTask('default', ['jshint', 'test']);



  
};
