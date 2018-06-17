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

        if (typeof GLOBAL_BASE_URL !== 'undefined' && GLOBAL_BASE_URL) {
            console.log("found base url: " + GLOBAL_BASE_URL);
            return GLOBAL_BASE_URL;
        } else if (location.hostname.startsWith("localhost")) {
            return "http://localhost:8080/public/xml/search-result.xml";
        }

        return "http://mlm.lge.com/di/sr/jira.issueviews:searchrequest-xml/temp/SearchRequest.xml";
    }

    _buildJql() {
        if (typeof GLOBAL_JQL !== 'undefined' && GLOBAL_JQL) {
            console.log("found jql: " + GLOBAL_JQL);
            return GLOBAL_JQL;
        } else if (location.hostname.startsWith("localhost")) {
            return "project in (LIFETRACK, THNQNATIVE) AND issuetype=Story";
        }

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
            .filter(s => s.dueDate && s.startDate)
            .filter(s => this._interestedDates(s.dueDate, s.startDate))
            .map(s => this._adjustDates(s))
            .value();

        console.log(JSON.stringify(this.storiesInterested));
        console.log(this.projectStats);
    }

    _interestedDates(...dates) {
        const prevWeek = this._datesLowerBoundary();
        const nextWeek = this._datesUpperBoundary();

        const betweens = _(dates).chain()
            //.map(d => moment(d))
            .filter(d => !isNaN(d) && this._isBetween(d, prevWeek, nextWeek))
            .value();

        return betweens.length > 0;
    }

    _isBetween(source, lower, upper) {
        return this._isSameOrAfter(source, lower) && this._isSameOrBefore(source, upper);
    }

    _isSameOrAfter(source, target) {
        // unless source and target is not moment object, throw exception... how?

        return source.isSame(target) || source.isAfter(target);
    }

    _isSameOrBefore(source, target) {
        // unless source and target is not moment object, throw exception... how?
        
        return source.isSame(target) || source.isBefore(target);
    }

    _datesLowerBoundary() {
        return moment().startOf('week').subtract(1, 'weeks');
    }

    _datesUpperBoundary() {
        return moment().endOf('week').add(1, 'weeks');
    }

    _adjustDates(s) {
        if (s.startDate.isBefore(this._datesLowerBoundary())) {
            s.startDate = this._datesLowerBoundary();
        }

        if (s.dueDate.isAfter(this._datesUpperBoundary())) {
            s.dueDate = this._datesUpperBoundary().subtract(1, 'hours');
        }

        return s;
    }
}

myProjectMap = new Map();

function main() {
    'use strict';

    generateHtml();

    const deferred = _(GLOBAL_PROJECTS).map(p => $.Deferred()).value();    

    $.when.apply($, deferred).then(
        function success() {
            const docs = arguments;
            _(docs).map(x => $(x)).map(xx => {
                const total = parseInt(xx.find('issue').attr('total') || 0, 10);
                const key = xx.find('item:first > project').attr('key');
                const dispName = xx.find('item:first > project').text();

                myProjectMap.set(key, {total: total, dispName: dispName});
            }).value();

            displayMain();
        },

        function failed(results) {
            
        }
    );

    const projectQueries = _(GLOBAL_PROJECTS).map(p => {
        if (location.hostname.startsWith("localhost")) {
            return `http://localhost:8080/public/xml/search-result-prj-${p}.xml`;
        }
        const start = moment().startOf('year').format('YYYY-MM-DD');
        const end = moment().endOf('year').format('YYYY-MM-DD');
        
        return `http://mlm.lge.com/di/sr/jira.issueviews:searchrequest-xml/temp/SearchRequest.xml?jqlQuery=project = ${p} AND created >= ${start} AND created <= ${end}&tempMax=2&field=project`; 
    }).map((q, i) => $.get(q, 'xml').success(xmldoc => deferred[i].resolve(xmldoc)).error(e => deferred[i].reject())).value();
}

function displayMain() {
    const url = new MyUrl();

    $.get(url.searchUrl, 'xml')
        .success(xmlDoc => {
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

        })
        .error(err => $("#people_div").html(`
            <br>Error: ${err.statusText}(${err.status})
            <br>ResponseText: ${err.responseText}
        `));
}

function showWorkView(is, storyArray) {

}

function showTimelineChart(id, storyArray) {
    if (storyArray.length <= 0) {
        return;
    }

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
        return [story.summary, story.startDate.toDate(), story.dueDate.toDate()];
    }).value();

    dataTable.addRows(rows);

    var options = {
        hAxis: {
            //minValue: moment().startOf('week').subtract(1, 'weeks').toDate(),
            //maxValue: moment().endOf('week').add(1, 'weeks').toDate()
            minValue: moment().startOf('week').subtract(1, 'weeks').toDate(),
            maxValue: moment().endOf('week').add(1, 'weeks').add(1, 'hours').toDate()
        },
        width: 1350,     
        height: rows.length * 100
    };

    chart.draw(dataTable, options);
}

function showPieChart(id, projectKey, statusMap) {
    let dataArr = [
        ['Status', 'Story']
    ];

    statusMap.forEach((v, k) => dataArr.push([k, v]));

    dataArr.push(['Total', myProjectMap.get(projectKey).total]);

    const data = google.visualization.arrayToDataTable(dataArr);

    var options = {
        title: myProjectMap.get(projectKey).dispName,
        width: 400,
        height: 300
    };

    var chart = new google.visualization.PieChart(document.getElementById(id));

    chart.draw(data, options);
}

function genTable(user) {
    const prjCount = user.projectStats.size;
    let prjTds = "";
    user.projectStats.forEach((v, k) => prjTds += `<td id='${user.key}_${k}'>${k} - ${v}</td>`);

    console.log("prjTds: " + prjTds);

    return `<table width=100% id='worktable_${user.key}'>                
                <tr>                    
                    ${prjTds}
                </tr>
                <tr>
                    <td colspan='${prjCount}' id='timeline_${user.key}'></td>
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
            <table id='people_table' width=100%>
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