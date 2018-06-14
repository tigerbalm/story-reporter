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

class Issue {
    constructor(item) {
        const $item = $(item);

        this.key = $item.find('key').text();
        this.type = $item.find('type').text();
        this.status = $item.find('status').text();
        this.assignee = $item.find('assignee').text();
        this.summary = $item.find('summary').text();
        this.component = $item.find('component').text();
        this.createdDate = $item.find('created').text();
        this.dueDate = $item.find('due').text();
        this.startDate = $item.find('customfield[id="customfield_12045"] > customfieldvalues > customfieldvalue').text();
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
            return "http://localhost:8080/public/xml/SearchRequest.xml";
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
        this.issue = {};
        this.items = [];

        this._parseXmlDoc(xmlDoc);
    }

    _parseXmlDoc(xml) {
        const $xml = $(xml);

        this._parseIssueCount($xml.find("issue"));
        this._parseItems($xml.find("item"));
    }

    _parseIssueCount(issueNode) {
        this.issue.total = issueNode.attr("total");
        this.issue.start = issueNode.attr("start");
        this.issue.end = issueNode.attr("end");
    }

    _parseItems(xmlitems) {
        xmlitems.each((index, value) => {
            this.items.push(new Issue(value));
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
    issues(option) {
        return this.items;
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

            //return [{name: 'lee', project: [{name: 'thinq', stories: 10, my_story: 2}, {}]}]
            // todo : convert xmldoc -> assignee array
        })
        .then(result => {            
            const issues = result.issues({
                project: "all"
            });

            console.log(JSON.stringify(issues));

            //$('#issues').text(`start: ${result.issue.start}, end: ${result.issue.end}, total: ${result.issue.total}`);

            drawChart(issues);
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