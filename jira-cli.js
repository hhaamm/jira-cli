var JiraApi = require('jira').JiraApi,
    nconf   = require("nconf"),
    sh = require('execSync'),
    exec = require('child_process').exec;

nconf.file({
    file: __dirname + "/config.json"
});

var api = new JiraApi('https', nconf.get("credentials:host"), null,
    nconf.get("credentials:user"), nconf.get("credentials:password"), 2);

var JiraCli = function(args) {
    // We remove first two params
    args.shift(); // Removes node path
    args.shift(); // Removes jira-cli
    this.command = args.shift();
    this.cliParams = args;

    if (this.cliParams[ this.cliParams.length -1 ] == "open") {
        this.cliParams.pop();
        this.openUrl = true;
    } else {
        this.openUrl = false;
    }
}

JiraCli.prototype.printHelp = function() {
    console.log("Use: jira-cli <command>");
    console.log("              newissue");
    console.log("              list");
}

JiraCli.prototype.run = function() {
    if (!this.command) {
        this.printHelp();
        return;
    }

    if (this[this.command + "Command"]) {
        this[this.command + "Command"].call(this, this.cliParams);

        if (this.openUrl) {
            exec("firefox https://jira.corp.appnexus.com/browse/" + this.issueKey, function(error, stdout, stderr) {

            });
        }
    } else {
        console.log("Unknown command " + this.command);
        process.exit(1);
    }
}

// ------ Commands section ------

JiraCli.prototype.newissueCommand = function() {
    var name = this.cliParams[0];

    var assignee, reporter;
    assignee = reporter = this.cliParams[1];
    var epic = null;

    if (this.cliParams.length == 3) {
        var epics = nconf.get("epics");
        if (epics[this.cliParams[2]]) {
            // An alias was used
            epic = epics[this.cliParams[2]];
        } else {
            // The param is the epic key
            epic = this.cliParams[2];
        }
    }

    var issue = {
        "fields" : {
            "project": {
                "id": nconf.get("defaultProjectId")
            },
            "summary": name,
            "issuetype": {
                "id": "3"  // task
                // id: "1" // bug
                // id: "6" // subtask
            },
            "assignee": {
                "name": assignee
            },
            "reporter": {
                "name": reporter
            }
        }
    };

    var self = this;

    api.addNewIssue(issue, function(error, response) {
        if (!error) {
            console.log(response.key);

            if (epic) {
                // We set epic
                self.__setEpic([response.key], epic);
            }

            process.exit(0);
        } else {
            console.log(error);
            process.exit(1);
        }
    });
}

JiraCli.prototype.listCommand = function() {
    var statuses = "open, 'In Progress', 'Code Review'";
    if (this.cliParams.length) {
        var statusDictionary = {
            "open": "open",
            "progress": "'In Progress'",
            "review": "'Code Review'"
        };

        statuses = statusDictionary[this.cliParams[0]];

        if (!statuses) {
            var statusKeys = [];
            for (var key in statusDictionary) {
                statusKeys.push(key);
            }
            console.log(statusKeys.join(", "));
            
            console.log("No status for key " + this.cliParams + ". Possible keys: " + statusKeys);
            
            process.exit(1);
        }
    }
    
    api.searchJira("project = " + nconf.get("defaultProjectName") + " and assignee = " + nconf.get("credentials:user") + " and status in (" + statuses + ")", {fields: ["summary", "status"]}, function(error, results) {

        if (error) {
            console.log(error);
            return;
        }

        for(var i = 0; i < results.issues.length; i++) {
            // Code with padding left
            console.log(results.issues[i].key + " | " + String("            " + results.issues[i].fields.status.name).slice(-11) + " | " + results.issues[i].fields.summary);
        }
    });
}

/**
 * It changes the status of an issue
 * Find out transitions: curl -D- -u <USER>:<PASS> <JIRA_URL>:<JIRA_PORT>/rest/api/latest/issue/<JIRA_ISSUE>/transitions?expand=transitions.fields
 * or
 * curl -D- -u <USER>:<PASS> https://jira.corp.appnexus.com/rest/api/2/statuscategory/2
 */
JiraCli.prototype.statusCommand = function() {
    var issue = this.cliParams[0];
    var status = this.cliParams[1];

    // Category ids
    var categoryIds = {
        "progress": 4,
        "new": 2,
        "done": 3,
        "review": 6
    };

    var statusId = categoryIds[status];

    if (!statusId) {
        console.log("ERROR: no category id for '" + status + "' status");
        process.exit(1);
    }

    var issueTransition = {
        "transition": {
            "id": statusId
        } //,
        // "update": {
        //     "comment": [
        //         {
        //             "add": {
        //                 "body": "Moving to In Progress"
        //             }
        //         }
        //     ]
        // }
    };

    console.log(issue);
    console.log(issueTransition);

    api.transitionIssue(issue, issueTransition, function(error, result) {
        console.log(error);
        console.log(result);
    });
}

/**
 * It shows the description of an Issue.
 */
JiraCli.prototype.describeCommand = function() {
    var issue = this.cliParams[0];

    api.findIssue(issue, function(error, result) {
        console.log("Issue  : " + result.key + " " + result.fields.summary);
        console.log("Status : " + result.fields.status.name);
        console.log(result.fields.description);
    });
}

JiraCli.prototype.discussionCommand = function() {
    var issue = this.cliParams[0];

}

JiraCli.prototype.commentCommand = function() {
    var issue = this.cliParams[0];

}

/**
 * Shows the first of the "In progress" task
 */
JiraCli.prototype.focusCommand = function() {

}

/**
 * Sets the epic of a certain Issue
 */
JiraCli.prototype.epicCommand = function() {

}

// ------ Utils section ------

JiraCli.prototype.__setEpic = function(issueKeys, epicKey) {
    // Set Epic link
    // https://confluence.atlassian.com/display/JIRAKB/Set+the+%27Epic+Link%27+via+REST+call

    var json = JSON.stringify({
        "ignoreEpics":true,
        "issueKeys": issueKeys
    });

    sh.run("curl --user " + nconf.get("credentials:user") + ":" + nconf.get("credentials:password") + " -d '" + json +"' -X PUT -H \"Content-Type: application/json\" https://" + nconf.get("credentials:host") + "/rest/greenhopper/1.0/epics/" + epicKey + "/add");
};

module.exports = JiraCli;
