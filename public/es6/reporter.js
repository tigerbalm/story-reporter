// todo
// 2. jpl query field 만들기
// 3. ui 작업하기
// 4. webpack 으로 js 파일 분리하기
// 5. url 작업 일관되게 변경
// 6. moment wrapper 작성
// 7. jql parser 만들기.. 그래도 component 는 다르게 해야 하지 않는지..
// 8. error 처리 (search query 에서 component 를 넣을지 말지.. 별도로도 처리가 가능한데..)
// 9. timeline graph 다시 그리기

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

            const start = moment().startOf('year').format('YYYY-MM-DD');
            const end = moment().endOf('year').format('YYYY-MM-DD');

            return `${GLOBAL_JQL} AND created >= ${start} AND created <= ${end} AND assignee not in (unassigned)`;
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
            tempMax: 1000
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
            .filter(s => (s.dueDate && s.dueDate.isValid()) && (s.startDate && s.startDate.isValid()))
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

                console.log(`project map : ${key}, ${dispName}, ${total}`);

                myProjectMap.set(key, {total: total, dispName: dispName});
            }).value();

            displayMain();
        },

        function failed(results) {
            
        }
    );

    const projectQueries = _(GLOBAL_PROJECTS).map((p, i) => {
        if (location.hostname.startsWith("localhost")) {
            return `http://localhost:8080/public/xml/search-result-prj-${p}.xml`;
        }
        const start = moment().startOf('year').format('YYYY-MM-DD');
        const end = moment().endOf('year').format('YYYY-MM-DD');
        
        let componentsAnd = "";
        if (typeof GLOBAL_COMPONENTS !== 'undefined' && GLOBAL_COMPONENTS) {
            //"component in ("SmartThinQ BasicDev", "SmartThinQ H&A Service", "SmartThinQ HE Service")"

            const compString = _(GLOBAL_COMPONENTS[i]).map(c => encodeURI(`'${c}'`)).value().join(',');
            componentsAnd = `component in (${compString}) AND`;
        }        
        
        return `http://mlm.lge.com/di/sr/jira.issueviews:searchrequest-xml/temp/SearchRequest.xml?jqlQuery=project = ${p} AND ${componentsAnd} created >= ${start} AND created <= ${end} AND assignee not in (unassigned)&tempMax=2&field=project`; 
    }).map((q, i) => $.get(q, 'xml').success(xmldoc => deferred[i].resolve(xmldoc)).error(e => deferred[i].reject())).value();
}

function displayMain() {
    const url = new MyUrl();
    $('#jql_query_text').val(url.jqlQuery);

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
    const chartHeight = (dataTable.getNumberOfRows() + 1) * 41 + 50;

    var options = {
        hAxis: {            
            minValue: moment().startOf('week').subtract(1, 'weeks').toDate(),
            maxValue: moment().endOf('week').add(1, 'weeks').add(1, 'hours').toDate()
        },
        width: 1350,     
        height: chartHeight
    };

    chart.draw(dataTable, options);
}

function showPieChart(id, projectKey, statusMap) {
    console.log("showPieChart: " + projectKey);

    let dataArr = [
        ['Status', 'Story']
    ];

    statusMap.forEach((v, k) => dataArr.push([k, v]));
    const numOfMine = _.sum(statusMap.values());

    dataArr.push(['Total', (myProjectMap.get(projectKey).total - numOfMine)]);

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

    return `<table style='border: 1px solid black;' width=100% id='worktable_${user.key}'>                
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

function onClickRefresh() {
    console.log("onClickRefresh clicked");
}

function generateHtml() {
    var html = `
        <div id='query_div' hidden><textarea rows="1" style='width: 500px; font: 1em sans-serif;-moz-box-sizing: border-box; box-sizing: border-box; border: 1px solid #999;' id='jql_query_text'/><button onClick='onClickRefresh()'>Refresh</button></div>
        <div id='projects' hidden>projects div</div>
        <div id='components' hidden>component div</div>
        <div id='issues'></div>
        <div id='people_div'>
            <table id='people_table' width=100%>
                <tbody id='first'>                
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