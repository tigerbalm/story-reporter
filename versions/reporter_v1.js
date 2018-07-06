// todo
// 3. timeline view 에서 과거는 resolved 만 / 미래는 open만 표시
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
    
    startProgress();    

    $.ajaxSetup({
        xhrFields: {
            withCredentials: true
        }
    });

    main();
});

let progressTimer;
function startProgress() {
    progressTimer = setInterval(() => {
        //const text = $("#center_progress_div").html();
        const ch = ['.', '..', '...'];

        const curHtml = $("#processing_flash").html();
        $("#processing_flash").html(ch[curHtml.length % 3]);

        const curColor = $("#processing_flash").css("color");
        $("#processing_flash").css("color", curColor == "rgb(255, 0, 0)" ? "blue" : "red");
    }, 1000);
}

function stopProgress() {
    clearInterval(progressTimer);
    $("#center_progress_div").hide();
}

class Story {
    constructor(item) {
        const $item = $(item);

        this.key = $item.find('key').text() || "";
        this.projectKey = $item.find('project').attr('key') || "";
        this.projectName = $item.find('project').text() || "";
        this.type = $item.find('type').text() || "";
        this.status = this._status($item.find('status').text() || "");
        this.assignee = $item.find('assignee').text() || "";
        this.summary = $item.find('summary').text() || "";
        this.component = $item.find('component').text() || "";
        this.link = $item.find('link').text() || "";
        
        this.createdDate = moment($item.find('created').text());        
        this.startDate = moment($item.find('customfield[id="customfield_12045"] > customfieldvalues > customfieldvalue').text());
        this.resolvedDate = moment($item.find('resolved').text());

        if (this.status === "resolved") {
            this.dueDate = moment(this.resolvedDate);
        } else {
            this.dueDate = moment($item.find('due').text());
        }
    }

    _status(status) {
        if (_.findIndex(['closed', 'resolved'], s => s.toUpperCase() === status.toUpperCase()) > -1) {
            return "resolved";
        } else {
            return "open";
        }
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
        return _(this._stories)
                    .uniqBy(s => s.projectName)
                    .map(s => s.projectName)
                    .value();
    }

    // returns unique projects list
    components() {
        return _(this._stories)          
                .filter(s => s.component)      
                .uniqBy(s => s.component)
                .map(s => s.component)
                .value();
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
        _(stories).chain().groupBy(s => s.projectKey)
            .map((group, key) => {
                const groupByStatus = _(group).chain().groupBy(s => s.status)
                    .value();
                const statusMap = new Map();

                _.forIn(groupByStatus, (v, k) =>
                    statusMap.set(k, v.length));

                this.projectStats.set(key, statusMap);
            }).value();

        // resolved job - due / resolved is in prev_week
        this.resolvedJobs = _(stories).chain()
                                    .filter(s => s.status === "resolved")
                                    .filter(s => this._vaildDate(s.dueDate))
                                    .filter(s => this._isBetween(s.dueDate, moment().startOf("week").subtract(1, "weeks"), moment().endOf("day")))
                                    .value();

        // open job - start date < next_week || due in cur_week
        this.openJobs = _(stories).chain()
                                    .filter(s => s.status !== "resolved")
                                    .filter(s => this._vaildStartDate(s.startDate))
                                    .filter(s => this._vaildEndDate(s.dueDate))
                                    .value();
    }

    _vaildStartDate(date) {
        return !vaildDate(date) || date.isBefore(this._datesUpperBoundary());
    }

    _vaildEndDate(date) {
        return vaildDate(date) && date.isAfter(this._datesLowerBoundary());
    }

    _interestedDates(...dates) {
        const prevWeek = this._datesLowerBoundary();
        const nextWeek = this._datesUpperBoundary();

        const betweens = _(dates).chain()
            .filter(d => !isNaN(d) && this._isBetween(d, prevWeek, nextWeek))
            .value();

        return betweens.length > 0;
    }

    _isBetween(source, lower, upper) {        
        return source && this._isSameOrAfter(source, lower) && this._isSameOrBefore(source, upper);
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

    _vaildDate(date) {
        return date && date.isValid();
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

                log(`Build project map : ${key}, ${dispName}, ${total}`);

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
            const compString = _(GLOBAL_COMPONENTS[i]).map(c => `"${c}"`).value().join(',');
            componentsAnd = `component in (${compString}) AND`;
        }
        
        const query = encodeURIComponent(`project = ${p} AND ${componentsAnd} created >= ${start} AND created <= ${end} AND assignee not in (unassigned)`);

        return `http://mlm.lge.com/di/sr/jira.issueviews:searchrequest-xml/temp/SearchRequest.xml?jqlQuery=${query}&tempMax=2&field=project`;
    }).map((q, i) => {
        $.get(q, 'xml')
            .success(xmldoc => {                
                deferred[i].resolve(xmldoc);
            })
            .fail(e => {
                log("Error: get project data - " + GLOBAL_PROJECTS[i]);
                deferred[i].reject();
            });
    }).value();
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
                $('#people_table > tbody:first').append(`
                        <tr>
                            <td>${pair.name}</td>
                            <td>${pair.table}</td>
                        </tr>
                    `);
            }).value();
            
            _(userStatArray).map(user => {
                user.projectStats.forEach((v, k) => showPieChart(`${user.key}_${k}`, k, v));
                showTimelineChart(`timeline_${user.key}`, user);
            }).value();

            stopProgress();
        })
        .error(err => $("#people_div").html(`
            <br>Error: ${err.statusText}(${err.status})
            <br>ResponseText: ${err.responseText}
        `));
}

function showTimelineChart(id, user) {
    if (user.resolvedJobs.length <= 0 && user.openJobs.length <= 0) {
        return;
    }

    var container = document.getElementById(id);
    var chart = new google.visualization.Timeline(container);
    var dataTable = new google.visualization.DataTable();

    dataTable.addColumn({ type: 'string', id: 'Status' });
    dataTable.addColumn({ type: 'string', id: 'Summary' });
    //dataTable.addColumn({ type: 'string', role: 'tooltip' });
    dataTable.addColumn({ type: 'date', id: 'Start' });
    dataTable.addColumn({ type: 'date', id: 'Due' });

    dataTable.addRows(toJobArray(user.resolvedJobs));
    dataTable.addRows(toJobArray(user.openJobs));

    const chartHeight = (dataTable.getNumberOfRows() + 1) * 41 + 50;

    var options = {
        hAxis: {            
            minValue: moment().startOf('week').subtract(1, 'weeks').toDate(),
            maxValue: moment().endOf('week').add(1, 'weeks').add(1, 'hours').toDate()
        },
        width: 1350,     
        height: chartHeight,
        avoidOverlappingGridLines: false,
        timeline: { groupByRowLabel: false, colorByRowLabel: true }
    };

    chart.draw(dataTable, options);
}

function toJobArray(storiesArr) {
    return _(storiesArr).map((story, i) => {
        let start = story.startDate;
        let end = story.dueDate;

        console.log(`${story.key} - ${story.assignee} - ${start} - ${end}`);

        // fixme conditions...
        if (!vaildDate(start) && vaildDate(end)) {
            start = moment().startOf('week').subtract(1, 'weeks');
        }

        if (vaildDate(start) && !vaildDate(end)) {
            end = moment().endOf('week').add(1, 'weeks').add(1, 'hours');
        }

        if (!vaildDate(start) && !vaildDate(end)) {
            start = moment().startOf('week').subtract(1, 'weeks');
            end = moment().endOf('week').add(1, 'weeks');
        }
        
        start = maxDate(start, moment().startOf('week').subtract(1, 'weeks'));
        end = minDate(end, moment().endOf('week').add(1, 'weeks')).endOf('day');

        return [`${story.status}`, story.summary, start.toDate(), end.toDate()];
    }).value();
}

function vaildDate(date) {
    return date && date.isValid();
}

function minDate(a, b) {
    return a.isBefore(b) ? a : b;
}

function maxDate(a, b) {
    return a.isAfter(b) ? a : b;
}

function showPieChart(id, projectKey, statusMap) {
    console.log("showPieChart: " + projectKey);

    let dataArr = [
        ['Who', 'Jobs']
    ];

    const myJobs = _.sum(Array.from(statusMap.values()));
    const others = myProjectMap.get(projectKey).total - myJobs;
    console.log(`${projectKey} - myJobs: ${myJobs}, others: ${others}`);

    dataArr.push(['My jobs', myJobs]);
    dataArr.push(['Others', others]);

    const data = google.visualization.arrayToDataTable(dataArr);
    
    var options = {
        title: `${myProjectMap.get(projectKey).dispName} (${myProjectMap.get(projectKey).total})`,
        width: 400,
        height: 300,
        pieHole: 0.4,
        pieSliceText: 'value',
        slices: {  
            0: {offset: 0.2, color: '#9966ff'},
            1: {color: '#33cccc'}            
        },
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
        <div id='guide' style='font-size: small; border:1px dashed; padding:10px;'>Timeline 표시 조건 : <br>
            <li>resolved : status is in (resolved, closed) && resolved date is between (지난주 시작일 and 오늘)</li>
            <li>open : status is NOT in (resolved, closed) && start date is empty or < 다음주 마지막 일 && due date is (NOT empty and > 지난주 시작일)</li>
        </div>
        <div id='query_div' hidden><textarea rows="1" style='width: 500px; font: 1em sans-serif;-moz-box-sizing: border-box; box-sizing: border-box; border: 1px solid #999;' id='jql_query_text'/><button onClick='onClickRefresh()'>Refresh</button></div>
        <div id='projects' hidden>projects div</div>
        <div id='components' hidden>component div</div>
        <div id='center_progress_div'>
            <p id='processing_flash' style='font-size:large; padding: 270px 0; text-align: center; color:red; font-weight:bold;'>.</p>            
        </div>
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
    console.log("addLink items: " + items);

    const html = items.map(item => `<span onclick='${onClick.name}("${item}")'>${item}</span>`).join(" | ");
    $(`#${id}`).html(html);
}

function log(text) {    
    console.log(text);
    
    //$('#log_message').html(text.replace('Error', '<span style="color:red; font-weight:bold;">Error</span>'));
}