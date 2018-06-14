'use strict';

google.charts.load('current', {
    'packages': ['timeline']
});
google.charts.setOnLoadCallback(() => {
    console.log("google chart loaded");

    main();
});

$(document).ready(() => {
    console.log("jquery doc ready");

    $.ajaxSetup({
        xhrFields: {
            withCredentials: true
        }
    });
});

class Story {
    constructor(item) {
        const $item = $(item);

        this.key = $item.find('key').text();
        this.key = $item.find('project').text();
        this.type = $item.find('type').text();
        this.status = $item.find('status').text();
        this.assignee = $item.find('assignee').text();
        this.summary = $item.find('summary').text();
        this.component = $item.find('component').text();
        this.createdDate = moment($item.find('created').text());
        this.dueDate = moment($item.find('due').text());
        this.startDate = moment($item.find('customfield[id="customfield_12045"] > customfieldvalues > customfieldvalue').text());
        this.link = $item.find('link').text();
    }
}

class MyUrl {
    constructor() {
        this.baseUrl = this._baseUrl();
        this.jqlQuery = this._buildJql();
        this.preferredFields = this._buildFields();
        this.searchUrl = this._buildSearchUrl();

        console.log("searchUrl: " + this.searchUrl);
    }

    _baseUrl() {
        console.log("hostname: " + location.hostname);

        if (location.hostname.startsWith("localhost")) {
            return "http://localhost:8080/public/xml/search-result.xml";
        }

        return "http://mlm.lge.com/di/sr/jira.issueviews:searchrequest-xml/temp/SearchRequest.xml";
    }

    _buildJql() {
        return "project=LIFETRACK AND issuetype=Story";
    }

    _buildFields() {
        const fields = ['summary', 'link', 'assignee', 'status', 'component', 'due', "created",
            'type', "customfields", "resolved", "customfield_12045", "customfieldvalues"
        ];

        return fields.map(item => "field=" + item).join("&");
    }

    _buildSearchUrl() {
        const params = {
            jqlQuery: this.jqlQuery,
            tempMax: 10
        };

        return this.baseUrl + "?" + $.param(params) + "&" + this.preferredFields;
    }
}

class SearchResult {
    constructor(xmlDoc) {
        this._issue = {};
        this._stories = [];

        this._parseXmlDoc(xmlDoc);
    }

    _parseXmlDoc(xml) {
        const $xml = $(xml);

        this._parseIssueCount($xml.find("issue"));
        this._parseItems($xml.find("item"));
    }

    _parseIssueCount(issueNode) {
        this._issue.total = issueNode.attr("total");
        this._issue.start = issueNode.attr("start");
        this._issue.end = issueNode.attr("end");
    }

    _parseItems(xmlitems) {
        xmlitems.each((index, value) => {
            this._stories.push(new Story(value));
        });

        //console.log(JSON.stringify(this.items));
    }

    // returns unique projects list
    projects() {
        return ["all", "ThinQ", "Lifetracker"];
    }

    // returns unique projects list
    components() {
        return ["all", "performance", "legacy"];
    }

    // return arrays of Issue
    stories() {
        return this._stories;
    }

    issue() {
        return this._issue;
    }
}

class UserStat {
    constructor(name, stories) {
        this.name = name;
        
        this.projectStats = new Map();
        _(stories).chain().groupBy(s => s.project)
                        .map((group, key) => {
                            const groupByStatus = _(group).chain().groupBy(s => s.status)
                                                                .value();                            
                            _.forIn(groupByStatus, (v, k) => 
                                this.projectStats.set(k, v.length));
                        }).value();                        
        this.storiesInterested = _(stories).chain()
                                        .filter(s => this._interestedDates(s.dueDate, s.startDate))
                                        .value();

        console.log(JSON.stringify(this.storiesInterested));
        console.log(this.projectStats);
    }

    _interestedDates(...dates) {
        const prevWeek = moment().startOf('week').subtract(1, 'weeks');
        const nextWeek = moment().endOf('week').add(1, 'weeks');

        const betweens = _(dates).chain()
                                .filter(date => !isNaN(date) && date.isBetween(prevWeek, nextWeek, null, '[]'))
                                .value();

        return betweens.length > 0;
    }
}

function main() {
    generateHtml();

    const url = new MyUrl(); 
    
    $.get(url.searchUrl, 'xml')
        .then(xmlDoc => new SearchResult(xmlDoc))
        .then(result => {
            addLinks("projects", result.projects(), onProjectClick);
            addLinks("components", result.components(), onComponentClick);

            return _(result.stories()).chain()
                    .groupBy(story => story.assignee)
                    .map((stories, key) => {
                        return new UserStat(key, stories)
                    })
                    .value();
            //return [{name: 'lee', project: [{name: 'thinq', stories: 10, my_story: 2}, {}]}]
            // todo : convert xmldoc -> assignee array
        })
        .then(userStatArray => {            
            //const issues = result.stories();

            console.log(JSON.stringify(userStatArray));

            //$('#issues').text(`start: ${result.issue.start}, end: ${result.issue.end}, total: ${result.issue.total}`);

            //drawChart(issues);
        });
}

function onProjectClick(project) {
    // refresh all with project
    console.log(`Project "${project}" is selected.`);
}

function onComponentClick(comp) {
    // refresh all with project
    console.log(`Component "${comp}" is selected.`);
}

function generateHtml() {
    var html = `
        <div id='projects'>projects div</div>
        <div id='components'>component div</div>
        <div id='issues'></div>
        <div id='peopel_table'>
            <table align="center" id="people_table">
            <tr>
                <th> Name </th>
                <th> Work </th>
            </tr>
          </table>
        </div>
        `;        

    $("#myCanvas").html(html);
}

function addLinks(id, items, onClick) {
    const html = items.map(item => `<span onclick='${onClick.name}("${item}")'>${item}</span>`).join(" | ");
    $(`#${id}`).html(html);
}

function drawChart(issues) {
    // issues.forEach((item, id) => {
    //     $('#people_table').append(`
    //         <tr>
    //             <td>${item.assignee}</td>
    //             <td>
    //                 <table id='${item.key}'>                        
    //                 </table>
    //             </td>
    //         </tr>
    //     `);
    // });

    var container = document.getElementById('timeline');
    var chart = new google.visualization.Timeline(container);
    var dataTable = new google.visualization.DataTable();

    dataTable.addColumn({
        type: 'string',
        id: 'President'
    });
    dataTable.addColumn({
        type: 'date',
        id: 'Start'
    });
    dataTable.addColumn({
        type: 'date',
        id: 'End'
    });
    dataTable.addRows([
        ['Washington', new Date(1789, 3, 30), new Date(1797, 2, 4)],
        ['Adams', new Date(1797, 2, 4), new Date(1801, 2, 4)],
        ['Jefferson', new Date(1801, 2, 4), new Date(1809, 2, 4)]
    ]);

    chart.draw(dataTable);
}