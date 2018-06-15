// todo
// 0. query 시간 정보 추가하기
// 1. project 정보 가져오기
// 2. jpl query field 만들기
// 3. ui 작업하기
// 4. webpack 으로 js 파일 분리하기

google.charts.load('current', {
    'packages': ['timeline', 'corechart']
});

google.charts.setOnLoadCallback(() => {
    console.log("google chart loaded");

    $.ajaxSetup({
        xhrFields: {
            withCredentials: true
        }
    });

    main();
});


class Story {
    constructor(item) {
        const $item = $(item);

        this.key = $item.find('key').text();
        this.proejctKey = $item.find('project').attr('key');
        this.proejctName = $item.find('project').text();
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
        return "project in (LIFETRACK, THNQNATIVE) AND issuetype=Story";
    }

    _buildFields() {
        const fields = ['project', 'summary', 'link', 'assignee', 'status', 'component', 'due', "created",
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
        this.key = name.replace(/[^A-Za-z]/g, "");

        this.projectStats = new Map();
        _(stories).chain().groupBy(s => s.proejctKey)
            .map((group, key) => {
                const groupByStatus = _(group).chain().groupBy(s => s.status)
                    .value();
                const statusMap = new Map();

                _.forIn(groupByStatus, (v, k) =>
                    statusMap.set(k, v.length));

                this.projectStats.set(key, statusMap);
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
            .filter(d => !isNaN(d) && this._isBetween(d, prevWeek, nextWeek))
            .value();

        return betweens.length > 0;
    }

    _isBetween(target, left, right) {
        return (target.isSame(left) || target.isAfter(left)) &&
            (target.isSame(right) || target.isBefore(right));
    }
}

function main() {
    'use strict';

    generateHtml();

    const url = new MyUrl();

    $.get(url.searchUrl, 'xml')
        .then(xmlDoc => {
            const result = new SearchResult(xmlDoc);

            addLinks("projects", result.projects(), onProjectClick);
            addLinks("components", result.components(), onComponentClick);

            const userStatArray = _(result.stories()).chain()
                .groupBy(story => story.assignee)
                .map((stories, key) => {
                    return new UserStat(key, stories)
                })
                .value();

            _(userStatArray).map(user => {
                return {
                    name: user.name,
                    table: genTable(user)
                };
            }).map(pair => {
                console.log("pair.table: " + pair.table);

                $('#people_table > tbody:first').append(`
                        <tr>
                            <td>${pair.name}</td>
                            <td>${pair.table}</td>
                        </tr>
                    `);
            }).value();

            //drawChart(issues);
            _(userStatArray).map(user => {
                user.projectStats.forEach((v, k) => showPieChart(`${user.key}_${k}`, k, v));
                showTimelineChart(`timeline_${user.key}`, user.storiesInterested);
            }).value();

        });
    // .then(result => {
    //     addLinks("projects", result.projects(), onProjectClick);
    //     addLinks("components", result.components(), onComponentClick);

    //     return _(result.stories()).chain()
    //         .groupBy(story => story.assignee)
    //         .map((stories, key) => {
    //             return new UserStat(key, stories)
    //         })
    //         .value();
    // })
    // .then(userStatArray => {
    //     //const issues = result.stories();

    //     console.log(JSON.stringify(userStatArray));

    //     _(userStatArray).map(user => {
    //         return {
    //             name: user.name,
    //             table: genTable(user)
    //         };
    //     }).map(pair => {
    //         console.log("pair.table: " + pair.table);

    //         $('#people_table > tbody:first').append(`
    //             <tr>
    //                 <td>${pair.name}</td>
    //                 <td>${pair.table}</td>
    //             </tr>
    //         `);
    //     }).value();

    //     //drawChart(issues);
    //     _(userStatArray).map(user => {
    //         user.projectStats.forEach((v, k) => showPieChart(`${user.key}_${k}`, k, v));
    //         showTimelineChart(`timeline_${user.key}`, user.storiesInterested);
    //     }).value();
    // });
}

function showTimelineChart(id, storyArray) {
    var container = document.getElementById(id);
    var chart = new google.visualization.Timeline(container);
    var dataTable = new google.visualization.DataTable();

    dataTable.addColumn({
        type: 'string',
        id: 'Summary'
    });
    dataTable.addColumn({
        type: 'date',
        id: 'Start'
    });
    dataTable.addColumn({
        type: 'date',
        id: 'Due'
    });

    const rows = _(storyArray).map(story => {
        console.log("story.summary: " + story.summary);
        console.log("startDate:" + story.startDate.toDate());
        console.log("dueDate:" + story.dueDate.toDate());

        //const start = new Date(story.startDate.year(), story.startDate.month(), story.startDate.date(), 0, 1, 0);
        //const end = new Date(story.dueDate.year(), story.dueDate.month(), story.dueDate.date(), 0, 1, 2);
        var start = new Date(2018, 10, 11);
        var end = new Date(2018, 10, 14);
        return ["story.summary", start, end];
    }).value();

    dataTable.addRows(rows);

    var options = {
        hAxis: {
            minValue: moment().startOf('week').subtract(1, 'weeks').toDate(),
            maxValue: moment().endOf('week').add(1, 'weeks').toDate()
        }
    };

    chart.draw(dataTable, options);
}

function showPieChart(id, projectKey, statusMap) {
    let dataArr = [
        ['Status', 'Story']
    ];

    statusMap.forEach((v, k) => dataArr.push([k, v]));

    dataArr.push(['Total', 20]);

    const data = google.visualization.arrayToDataTable(dataArr);

    var options = {
        title: projectKey
    };

    var chart = new google.visualization.PieChart(document.getElementById(id));

    chart.draw(data, options);
}

function genTable(user) {
    const prjCount = user.projectStats.size;
    let prjTds = "";
    user.projectStats.forEach((v, k) => prjTds += `<td height='300' id='${user.key}_${k}'>${k} - ${v}</td>`);

    console.log("prjTds: " + prjTds);

    return `<table id='worktable_${user.key}'>                
                <tr>                    
                    ${prjTds}
                </tr>
                <tr>
                    <td height='300' colspan='${prjCount}' id='timeline_${user.key}'></td>
                </tr>
            </table>
            `;
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
        <div id='people_div'>
            <table id='people_table'>
                <tbody id='first'>
                <tr>
                    <th> name </th>
                    <th> work </th>
                </tr>
                </tbody>
            </table>
        </div>
        `;

    $("#myCanvas").html(html);
}

function addLinks(id, items, onClick) {
    const html = items.map(item => `<span onclick='${onClick.name}("${item}")'>${item}</span>`).join(" | ");
    $(`#${id}`).html(html);
}