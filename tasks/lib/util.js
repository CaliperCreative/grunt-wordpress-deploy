(function() {
  "use strict";
  exports.init = function(grunt) {
    var exports, lineReader, replace, shell, tpls;
    shell = require("shelljs");
    lineReader = require("line-reader");
    replace = require("replace");
    exports = {};
    exports.db_dump = function(config, output_paths) {
      var cmd, output;
      exports.check_for_mysql(config);
      grunt.file.mkdir(output_paths.dir);
      if (config.table_prefix) {
        // grunt.log.oklns "Using table prefix \"" + config.table_prefix + "\""
        cmd = exports.prefixed_mysqldump_cmd(config);
      } else {
        // grunt.log.oklns "NOT using table prefix \"" + config.table_prefix + "\""
        cmd = exports.mysqldump_cmd(config);
      }
      if (!cmd) {
        return false;
      }
      output = shell.exec(cmd, {
        silent: true
      }).output;
      grunt.file.write(output_paths.file, output);
      grunt.log.oklns("Database DUMP succesfully exported to: " + output_paths.file);
    };
    exports.prefixed_mysqldump_cmd = function(config, output_paths) {
      var prefix_matches, start_ln, tables_to_dump;
      prefix_matches = exports.all_table_prefix_matches(config);
      grunt.log.oklns("Prefix matches from search '" + config.table_prefix + "'");
      start_ln = '  + ';
      if (prefix_matches.length === 0) {
        grunt.log.errorlns("No prefix matches found for '" + config.table_prefix + "'");
        return false;
      }
      console.log(start_ln + grunt.log.wordlist(prefix_matches, {
        separator: '\n' + start_ln
      }));
      tables_to_dump = exports.tables_to_dump(config, prefix_matches);
      grunt.log.oklns("Tables to dump");
      console.log(start_ln + grunt.log.wordlist(tables_to_dump, {
        separator: '\n' + start_ln
      }));
      
      // Return the cmd
      return exports.build_prefixed_sqldump(config, tables_to_dump);
    };
    
    // Find all table prefix that match the config.table_prefix
    // (i.e. the prefix 'wp_' could match 'wp_', 'wp_backup_', etc.)  
    exports.all_table_prefix_matches = function(config) {
      var dest, prefix_match_tpls, prefix_matches, prefix_matches_cmd, sql_connect, table_prefix, tables_sql, tpl_ssh;
      table_prefix = config.table_prefix || "wp_";
      prefix_match_tpls = {
        sql: "-e SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = \"<%= database %>\" AND TABLE_NAME LIKE \"<%= table_prefix %>%posts\";",
        prefix_matches_cmd: "<%= sql_connect %> '<%= tables_sql %>' | grep -v -e TABLE_NAME | sed -e 's/posts//g' | xargs "
      };
      
      // var works_in_shell = "mysql wordpress -u admin --password=admin -e 'SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = \"wordpress\" AND TABLE_NAME LIKE \"wp_%posts\";' | grep -v -e TABLE_NAME | sed -e 's/posts//g'";
      // console.log( shell.exec( works_in_shell ).output ); return false;
      sql_connect = grunt.template.process(tpls.sql_connect, {
        data: {
          user: config.user,
          pass: config.pass,
          database: config.database,
          host: config.host
        }
      });
      tables_sql = grunt.template.process(prefix_match_tpls.sql, {
        data: {
          database: config.database,
          table_prefix: table_prefix
        }
      });
      
      // grunt.log.writeln('tables sql');
      // console.log(tables_sql);
      prefix_matches_cmd = grunt.template.process(prefix_match_tpls.prefix_matches_cmd, {
        data: {
          sql_connect: sql_connect,
          tables_sql: tables_sql
        }
      });
      dest = config.ssh_host != null ? 'remote' : 'local';
      grunt.log.ok("Getting prefix matches from " + dest + " db:'" + config.database + "' prefix:'" + config.table_prefix + "'");
      if (config.ssh_host != null) {
        tpl_ssh = grunt.template.process(tpls.ssh, {
          data: {
            host: config.ssh_host
          }
        });
        prefix_matches_cmd = tpl_ssh + " \"" + prefix_matches_cmd.replace(/\"/g, '\\"') + "\"";
      }
      // console.log('cmd \n' + prefix_matches_cmd);
      prefix_matches = shell.exec(prefix_matches_cmd, {
        silent: true
      }).output;
      // Make sure to remove 'stdin: is not a tty' if that error appears
      // Fix : On the destination server, edit /etc/bashrc file and comment out the "mesg y" line.
      // http://www.linux.org/threads/stdin-is-not-a-tty.16/?codekitCB=415084070.551448
      prefix_matches = prefix_matches.replace(/stdin: is not a tty/g, "");
      // Also remove MySQL command line warning (found on SiteGround servers)
      prefix_matches = prefix_matches.replace(/Warning: Using a password on the command line interface can be insecure./g, "");
      // Remove new lines/return chars
      prefix_matches = prefix_matches.replace(/(\r\n|\n|\r)/g, "");
      if (prefix_matches.length === 0) {
        return [];
      }
      return prefix_matches.split(" ");
    };
    
    // Return Array of tables to dump
    // Builds a SQL statement that SELECTS table_names
    //        LIKE '<%= config.table_prefix_ =>%'
    //        and NOT LIKE '<%= other_matched_prefixes %>_'
    exports.tables_to_dump = function(config, prefix_matches) {
      var cmd, comparison, i, j, len, match, prefix_tpls, ref, sql, sql_connect, table, table_exclusions, tables_to_dump;
      prefix_tpls = {
        sql: "-e SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = \"<%= database %>\" <%= comparison %> <%= table_exclusions %>;",
        like: " AND TABLE_NAME LIKE \"<%= match %>%\"",
        not_like: " AND TABLE_NAME NOT LIKE \"<%= match %>%\"",
        exclude_table: " AND TABLE_NAME NOT LIKE \"%<%= table %>%\"",
        cmd: "<%= sql_connect %> '<%= sql %>' | grep -v -e TABLE_NAME | xargs "
      };
      sql_connect = grunt.template.process(tpls.sql_connect, {
        data: {
          user: config.user,
          pass: config.pass,
          database: config.database,
          host: config.host
        }
      });
      comparison = "";
      i = 0;
      while (i < prefix_matches.length) {
        match = prefix_matches[i];
        if (!match) {
          continue;
        }
        if (match === config.table_prefix) {
          comparison += grunt.template.process(prefix_tpls.like, {
            data: {
              match: match
            }
          });
        } else {
          
          // comparison += " AND TABLE_NAME LIKE '" + match + "%'";
          comparison += grunt.template.process(prefix_tpls.not_like, {
            data: {
              match: match
            }
          });
        }
        i++;
      }
      table_exclusions = '';
      if (config.table_exclusions != null) {
        ref = config.table_exclusions;
        for (j = 0, len = ref.length; j < len; j++) {
          table = ref[j];
          table_exclusions += grunt.template.process(prefix_tpls.exclude_table, {
            data: {
              table: table
            }
          });
        }
      }
      
      // comparison += " AND TABLE_NAME NOT LIKE '" + match + "%'";
      sql = grunt.template.process(prefix_tpls.sql, {
        data: {
          database: config.database,
          comparison: comparison,
          table_exclusions: table_exclusions
        }
      });
      cmd = grunt.template.process(prefix_tpls.cmd, {
        data: {
          sql_connect: sql_connect,
          sql: sql
        }
      });
      if (config.ssh_host != null) {
        cmd = exports.add_ssh_connect(config, cmd);
      }
      // console.log "tables to dump cmd \n" + cmd

      // Make sure you strip the new line chars
      tables_to_dump = shell.exec(cmd, {
        silent: true
      }).output.replace(/(\r\n|\n|\r)/g, "");
      // console.log "tables_to_dump\n" + tables_to_dump
      tables_to_dump = tables_to_dump.replace('stdin: is not a tty', '');
      tables_to_dump = tables_to_dump.replace('Warning: Using a password on the command line interface can be insecure.', '');
      return tables_to_dump.split(" ");
    };
    
    // Run the mysqldump cmd and append the table names from exports.tables_to_dump() fn
    exports.build_prefixed_sqldump = function(config, tables_to_dump) {
      var cmd, dest;
      if (!tables_to_dump) {
        return false;
      }
      cmd = exports.mysqldump_cmd(config) + " " + tables_to_dump.join(" ");
      dest = config.ssh_host != null ? 'remote' : 'local';
      grunt.log.ok("Creating DUMP of " + dest + " database '" + config.database + "' with prefix '" + config.table_prefix + "'");
      // console.log "prefixed sqldump cmd\n" + cmd
      return cmd;
    };
    exports.add_ssh_connect = function(config, cmd) {
      var tpl_ssh;
      tpl_ssh = grunt.template.process(tpls.ssh, {
        data: {
          host: config.ssh_host
        }
      });
      cmd = tpl_ssh + " \"" + cmd.replace(/\"/g, '\\"') + "\"";
      // console.log cmd, 'add ssh connect'
      return cmd;
    };
    exports.db_import = function(config, src) {
      shell.exec(exports.mysql_cmd(config, src));
      grunt.log.oklns("Database imported succesfully");
    };
    exports.rsync_push = function(config) {
      var cmd;
      grunt.log.oklns("Syncing data from '" + config.from + "' to '" + config.to + "' with rsync.");
      cmd = exports.rsync_push_cmd(config);
      grunt.log.writeln(cmd);
      shell.exec(cmd);
      grunt.log.oklns("Sync completed successfully.");
    };
    exports.rsync_pull = function(config) {
      var cmd;
      grunt.log.oklns("Syncing data from '" + config.from + "' to '" + config.to + "' with rsync.");
      cmd = exports.rsync_pull_cmd(config);
      grunt.log.writeln(cmd);
      shell.exec(cmd);
      grunt.log.oklns("Sync completed successfully.");
    };
    exports.generate_backup_paths = function(target, task_options) {
      var backups_dir, directory, filepath;
      backups_dir = task_options.backups_dir || "backups";
      directory = grunt.template.process(tpls.backup_path, {
        data: {
          backups_dir: backups_dir,
          env: target,
          date: grunt.template.today("yyyy-mm-dd"),
          time: grunt.template.today("HH-MM-ss")
        }
      });
      filepath = directory + "/db_backup.sql";
      return {
        dir: directory,
        file: filepath
      };
    };
    exports.compose_rsync_options = function(options) {
      var args;
      args = options.join(" ");
      return args;
    };
    exports.compose_rsync_exclusions = function(options) {
      var exclusions, i;
      exclusions = "";
      i = 0;
      i = 0;
      while (i < options.length) {
        exclusions += "--exclude '" + options[i] + "' ";
        i++;
      }
      exclusions = exclusions.trim();
      return exclusions;
    };
    exports.db_adapt = function(target_env, local_env, src_file, dest_file) {
      var new_prefix, new_url, old_prefix, old_url, output, sqldump_output;
      sqldump_output = grunt.file.read(src_file);
      output = sqldump_output;
      old_url = target_env.url;
      new_url = local_env.url;
      grunt.log.oklns("Set the correct urls for the destination in the database...");
      console.log({old_url, new_url});
      grunt.writeln;
      output = exports.replace_urls(old_url, new_url, output);
      old_prefix = target_env.table_prefix;
      new_prefix = local_env.table_prefix;
      grunt.log.oklns("New prefix:" + new_prefix + " / Old prefix:" + old_prefix);
      if (old_prefix && new_prefix) {
        grunt.log.ok("Swap out old table prefix for new table prefix [ old: " + old_prefix + " | new: " + new_prefix + " ]...");
        output = exports.replace_table_prefix(old_prefix, new_prefix, output);
      }
      output = "-- Database Adapted via grunt-wordpress-deploy on " + grunt.template.today('yyyy-mm-dd "at" HH:MM::ss') + "\n\n" + output;
      if (!dest_file) {
        dest_file = src_file;
      }
      grunt.file.write(dest_file, output);
      exports.remove_strings_from_sql(target_env, local_env, dest_file, output);
      exports.replace_strings_from_sql(target_env, dest_file, output);
    };
    exports.replace_urls = function(search, replace, content) {
      content = exports.replace_urls_in_serialized(search, replace, content);
      grunt.log.ok('Replaced URLs in serialized data');
      content = exports.replace_urls_in_string(search, replace, content);
      grunt.log.ok('Replaced URLs in string');
      return content;
    };
    exports.replace_table_prefix = function(old_prefix, new_prefix, sqldump_output) {
      var regexp;
      regexp = new RegExp("(?!" + new_prefix + ")(" + old_prefix + ")", "g");
      return sqldump_output.replace(regexp, new_prefix);
    };
    exports.replace_urls_in_serialized = function(search, replace, string) {
      var delimiter, length, length_delta, matches, new_serialized_data, new_url, old_serialized_data, regexp, target_string;
      length_delta = search.length - replace.length;
      // Replace for serialized data
      regexp = /s:(\d+):([\\]*['"])(.*?)\2;/g;
      while (matches = regexp.exec(string)) {
        old_serialized_data = matches[0];
        target_string = matches[3];
        
        // If the string contains the url make the substitution
        if (target_string.indexOf(search) !== -1) {
          length = matches[1];
          delimiter = matches[2];
          // Replace the url
          new_url = target_string.replace(search, replace);
          length -= length_delta;
          
          // Compose the new serialized data
          new_serialized_data = "s:" + length + ":" + delimiter + new_url + delimiter + ";";
          
          // Replace the new serialized data into the dump
          string = string.replace(old_serialized_data, new_serialized_data);
        }
      }
      return string;
    };
    exports.replace_urls_in_string = function(search, replace, string) {
      var regexp;
      regexp = new RegExp("(?!" + replace + ")(" + search + ")", "g");
      return string.replace(regexp, replace);
    };
    exports.remove_strings_from_sql = function(search_options, replace_options, dest_file, sqldump) {
      var file_to_run_replace_on, i, j, k, len, len1, ref, ref1, replaced_sql;
      // Write tmp file to run replacement on (solution b/c I could NOT overrite any SQL files...weird...)
      file_to_run_replace_on = dest_file + '.tmp';
      grunt.file.write(file_to_run_replace_on, sqldump);
      if (typeof search_options.sql_remove === "object" && search_options.sql_remove.length > 0) {
        grunt.log.oklns("Removing strings from sql dump...");
        ref = search_options.sql_remove;
        for (j = 0, len = ref.length; j < len; j++) {
          i = ref[j];
          console.log("'" + i + "'");
          replace({
            regex: i,
            replacement: '',
            paths: [file_to_run_replace_on]
          });
        }
      }
      if (typeof replace_options.sql_remove === "object" && replace_options.sql_remove.length > 0) {
        grunt.log.oklns("Removing strings from sql dump...");
        ref1 = replace_options.sql_remove;
        for (k = 0, len1 = ref1.length; k < len1; k++) {
          i = ref1[k];
          console.log("'" + i + "'");
          replace({
            regex: i,
            replacement: '',
            paths: [file_to_run_replace_on]
          });
        }
      }
      replaced_sql = grunt.file.read(file_to_run_replace_on);
      // Overwrite the existing file with the new replaced string
      grunt.file.write(dest_file, replaced_sql);
      // Delete temp file
      return grunt.file.delete(file_to_run_replace_on);
    };
    exports.replace_strings_from_sql = function(target_env, dest_file, sqldump) {
      var file_to_run_replace_on, j, len, pair, ref, replaceString, replaced_sql, searchString;
      // Write tmp file to run replacement on (solution b/c I could NOT overrite any SQL files...weird...)
      file_to_run_replace_on = dest_file + '.tmp';
      grunt.file.write(file_to_run_replace_on, sqldump);
      if (typeof target_env.sql_replace === "object" && target_env.sql_replace.length > 0) {
        grunt.log.oklns("Replacing user-defined strings...");
        ref = target_env.sql_replace;
        for (j = 0, len = ref.length; j < len; j++) {
          pair = ref[j];
          searchString = pair[0];
          replaceString = pair[1];
          console.log(`Replacing '${searchString}' with '${replaceString}'`);
          replace({
            regex: searchString,
            replacement: replaceString,
            paths: [file_to_run_replace_on]
          });
        }
      }
      replaced_sql = grunt.file.read(file_to_run_replace_on);
      // Overwrite the existing file with the new replaced string
      grunt.file.write(dest_file, replaced_sql);
      // Delete temp file
      return grunt.file.delete(file_to_run_replace_on);
    };
    
    // Commands generators 
    exports.mysqldump_cmd = function(config) {
      var cmd, tpl_ssh;
      cmd = grunt.template.process(tpls.mysqldump, {
        data: {
          user: config.user,
          pass: config.pass,
          database: config.database,
          host: config.host,
          port: config.port || 3306
        }
      });
      if (typeof config.ssh_host === "undefined") {

      } else {
        // grunt.log.oklns "Building dump cmd for REMOTE database [" + config.database + "]"
        // grunt.log.oklns "Building dump cmd for LOCAL database [" + config.database + "]"
        tpl_ssh = grunt.template.process(tpls.ssh, {
          data: {
            host: config.ssh_host
          }
        });
        cmd = tpl_ssh + " '" + cmd + "'";
      }
      return cmd;
    };
    exports.mysql_cmd = function(config, src) {
      var cmd, mysql_tpl, ssh_tpl;
      mysql_tpl = grunt.template.process(tpls.mysql, {
        data: {
          host: config.host,
          user: config.user,
          pass: config.pass,
          database: config.database,
          path: src
        }
      });
      if (typeof config.ssh_host === "undefined") {
        grunt.log.oklns("Importing DUMP into local database");
        cmd = mysql_tpl + " < " + src;
        console.log(mysql_tpl);
      } else {
        ssh_tpl = grunt.template.process(tpls.ssh, {
          data: {
            host: config.ssh_host
          }
        });
        grunt.log.oklns("Importing DUMP into remote database");
        cmd = ssh_tpl + " \"" + mysql_tpl + "\" < " + src;
      }
      return cmd;
    };
    exports.rsync_push_cmd = function(config) {
      var cmd;
      cmd = grunt.template.process(tpls.rsync_push, {
        data: {
          rsync_args: config.rsync_args,
          ssh_host: config.ssh_host,
          from: config.from,
          to: config.to,
          exclusions: config.exclusions
        }
      });
      return cmd;
    };
    exports.rsync_pull_cmd = function(config) {
      var cmd;
      cmd = grunt.template.process(tpls.rsync_pull, {
        data: {
          rsync_args: config.rsync_args,
          ssh_host: config.ssh_host,
          from: config.from,
          to: config.to,
          exclusions: config.exclusions
        }
      });
      return cmd;
    };
    exports.get_path = function(options, grunt) {
      var invalid_path_error, path_string;
      invalid_path_error = `Invalid path provided from '${options.title}'.`;
      // If the path has multiple keys (is an object)
      if (typeof options.path === "object") {
        if (!grunt.option("path-key")) { // If the path is an object but there's no specified key
          grunt.fail.warn(`${invalid_path_error} Either change the config so 'path:' is a path String, or specify a valid path key using the '--path-key' flag.`);
        } else {
          path_string = options.path[grunt.option("path-key")];
        }
      } else if (typeof options.path === "string") { // If the path is a string
        // Set the path to either the --path-key || options.path
        path_string = options.path;
      } else {
        grunt.fail.warn(`${invalid_path_error} Check your configuration and provide a valid path.`);
      }
      return path_string;
    };
    exports.check_for_mysql = function(grunt) {
      var which_mysql;
      which_mysql = shell.which('mysql');
      if (!shell.which('mysql')) {
        return grunt.fail.fatal('Error: Local MySQL not found! Check your $PATH config to make sure shell can find a MySQL executable...');
      }
    };
    // Allow for manual SQL dump file
    exports.validate_sql_src_file = function(grunt) {
      var cli_sql_src;
      if (!grunt.option('sql-src')) {
        return false;
      }
      cli_sql_src = grunt.option('sql-src');
      if (grunt.file.exists(cli_sql_src)) {
        return grunt.log.oklns('Setting sql src file : ' + cli_sql_src);
      } else {
        return grunt.fail.warn('Manual sql src file not found : ' + cli_sql_src + '. Check the filename spelling and confirm it exists.');
      }
    };
    tpls = {
      backup_path: "<%= backups_dir %>/<%= env %>/<%= date %>/<%= time %>",
      mysqldump: "MYSQL_PWD=<%= pass %> mysqldump -h <%= host %> -u<%= user %> <%= database %> --port <%= port %>",
      mysql: "MYSQL_PWD=<%= pass %> mysql -h <%= host %> -u <%= user %> <%= database %>",
      sql_connect: "mysql -h <%= host %> <%= database %> -u <%= user %> --password='<%= pass %>'",
      rsync_push: "rsync <%= rsync_args %> -e 'ssh <%= ssh_host %>' <%= exclusions %> <%= from %> :<%= to %>",
      rsync_pull: "rsync <%= rsync_args %> -e 'ssh <%= ssh_host %>' <%= exclusions %> :<%= from %> <%= to %>",
      ssh: "ssh <%= host %>"
    };
    return exports;
  };

}).call(this);
