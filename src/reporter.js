// todo
// 3. timeline view 에서 과거는 resolved 만 / 미래는 open만 표시
// 5. url 작업 일관되게 변경
// 7. jql parser 만들기.. 그래도 component 는 다르게 해야 하지 않는지..
// 8. error 처리 (search query 에서 component 를 넣을지 말지.. 별도로도 처리가 가능한데..)
// 9. timeline graph 다시 그리기

// 1. 500개 이상 data 처리
// 2. interaction

import css from './base.css';
import MomentUtil from './moment_util.js';
import MyUrl from './url.js';
import UserStat from './user_stat.js';
import SearchResult from './search_result.js';
import {
    range,
    map
} from 'lodash';
import moment from 'moment';
import {
    GoogleCharts
} from 'google-charts';
import ProjectMap from './project_map.js';
import URI from 'urijs';

let AJS;
if (typeof AJS === 'undefined') {
    console.log("ajs undeinfed");

    AJS = {
        toInit(callback) {
            callback();
        }
    };
}

AJS.toInit(function() {
    //require("atlassian/analytics/user-activity-xhr-header").uninstall();

    GoogleCharts.load(() => {
        console.log("google chart loaded");
    
        startProgress();
    
        $.ajaxSetup({
            xhrFields: {
                withCredentials: true
            }
        });
    
        main2();
    }, ['timeline', 'corechart']);    
});

let progressTimer;
let timelineMap = new Map();
let pieChartMap = new Map();
let projects = new ProjectMap();
let stories = [];
const BUCKET_SIZE = 500;

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

function main2() {
    generateHtml();

    const url = new MyUrl(GLOBAL_BASE_URL, GLOBAL_JQL, 1);
    console.log("first fetch : " + url.searchUrl);

    $.get(url.searchUrl, 'xml')
        .success(xmlDoc => fetchData(xmlDoc))
        .error(err => {
            $("#people_div").html(`
                <br>Error: ${err.statusText}(${err.status})
                <br>ResponseText: ${err.responseText}
            `);
        });
}

let channelLink;

function fetchData(xmlDoc2) {
    const result2 = new SearchResult(xmlDoc2);
    const issues = result2.issue();

    channelLink = result2.link();

    $("#link_to_search_result").html(`<a href='${channelLink}' target='_blank' class='mylink'>MLM에서 전체 검색 결과 보기</a>`);

    const loop = Math.ceil((issues.total) / 500);
    console.log(`total: ${issues.total}, loop: ${loop}`);

    const deferred = _.range(0, loop).map(p => $.Deferred());

    $.when.apply($, deferred).done((...args) => {
        const docs = args;

        _(docs).map(d => new SearchResult(d))
            .map(result => {
                projects.add(result);
                stories = stories.concat(result.stories());
            }).value();

        updateGraph(stories);
    }).fail(err => {
        $("#people_div").html(`
            <br>Error: ${err.statusText}(${err.status})
            <br>ResponseText: ${err.responseText}
            `);
    }).always(() => {
        stopProgress();
    });

    const url2 = new MyUrl(GLOBAL_BASE_URL, GLOBAL_JQL, BUCKET_SIZE);
    _.range(0, loop).forEach((x, i) => {
        url2.setStartAt(BUCKET_SIZE * x);
        console.log("url2: " + url2.searchUrl);

        $.get(url2.searchUrl, 'xml')
            .success(xmlDoc => {
                deferred[i].resolve(xmlDoc);
            }).error(err => {
                $("#people_div").html(`
                    <br>Error: ${err.statusText}(${err.status})
                    <br>ResponseText: ${err.responseText}
                `);

                deferred[i].reject();
            });
    });
}

function updateGraph(items) {
    _(items)
        .groupBy(story => story.assignee)
        .map((stories, key) => {
            return new UserStat(key, stories);
        }).map(user => {
            if ($(`#worktable_${user.key}`).length <= 0) {
                const table = genTable(user);
                $('#people_table > tbody:first').append(`
                    <tr>
                        <td class='name'>${user.name}</td>
                        <td>${table}</td>
                    </tr>
                `);
            }

            return user;
        }).map(user => {
            user.projectStats.forEach((stat, proj_key) => showPieChart2(projects.get(proj_key), user, proj_key, stat));
            showTimelineChart(`timeline_${user.key}`, user);
        }).value();
}

function genTable(user) {
    return `
        <div id='worktable_${user.key}' class='round'>
            <div id='pie_${user.key}'></div>
            <div id='timeline_${user.key}'></div>
        </div>
    `;
}

function showPieChart2(projectInfo, user, projectKey, statusMap) {
    const userKey = user.key;
    const id = `${userKey}_${projectKey}`;

    console.log("showPieChart: " + projectKey + ", id: " + id);

    if ($(`#pie_${userKey} > ${id}`).length <= 0) {
        $(`#pie_${userKey}`).append(`<div id='${id}' style='display: inline-table;'></div>`);
    }

    var chart = new google.visualization.PieChart(document.getElementById(id));

    const cachedPie = pieChartMap.get(id);
    let cachedMyJobs = 0;
    if (cachedPie) {
        chart = cachedPie.chart;
        cachedMyJobs = cachedPie.myJobs;
    }

    const myJobs = _.sum(Array.from(_.values(statusMap).map(s => s.length))) + cachedMyJobs;
    const others = projectInfo.total - myJobs;
    console.log(`${projectKey} - myJobs: ${myJobs}, others: ${others}`);

    var data = new google.visualization.DataTable();
    data.addColumn('string', 'Who');
    data.addColumn('number', 'Jobs');

    data.addRows([
        ['My jobs', myJobs],
        ['Others', others]
    ]);

    var options = {
        title: `${projectInfo.name} (${projectInfo.total})`,
        width: 400,
        height: 300,
        pieHole: 0.4,
        pieSliceText: 'value',
        slices: {
            0: {
                offset: 0.2,
                color: '#9966ff'
            },
            1: {
                color: '#33cccc'
            }
        },
        backgroundColor: {
            fill: 'transparent'
        }
    };

    google.visualization.events.addListener(chart, 'select', () => {
        const item = chart.getSelection()[0];
        if (typeof item === 'undefined') {
            console.error("selectedItem is undefined");
            return;
        }
        
        // item: {"row":1,"column":null}
        // row 0 -> my jobs, row 1 -> others

        const replacement = `assignee ${item.row == 0? '=' : '!='}'${user.username}' AND project ='${projectKey}'`;

        const parsedUri = URI.parse(_.unescape(channelLink));
        const parsedQuery = URI.parseQuery(parsedUri.query);
        parsedQuery.jqlQuery = `${replacement} AND (${parsedQuery.jqlQuery})`;
        parsedUri.query = URI.buildQuery(parsedQuery);

        const newUri = URI.build(parsedUri);

        console.log("channelLink: " + channelLink);
        console.log("newUri: " + newUri);

        window.open(newUri, '_blank');
    });

    chart.draw(data, options);

    pieChartMap.set(id, {
        chart: chart,
        myJobs: myJobs
    });
}

function showTimelineChart(id, user) {
    if (user.resolvedJobs.length <= 0 && user.openJobs.length <= 0) {
        return;
    }

    var container = document.getElementById(id);
    var chart = new google.visualization.Timeline(container);
    var dataTable = new google.visualization.DataTable();

    const cachedChart = timelineMap.get(id);
    if (cachedChart) {
        chart = cachedChart.chart;
        dataTable = cachedChart.dataTable;
    } else {
        dataTable.addColumn({
            type: 'string',
            id: 'Status'
        });
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
    }

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
        timeline: {
            groupByRowLabel: false,
            colorByRowLabel: true
        },
        backgroundColor: {
            fill: 'transparent'
        }
    };

    chart.draw(dataTable, options);

    timelineMap.set(id, {
        chart: chart,
        dataTable: dataTable
    });

    google.visualization.events.addListener(chart, 'select', () => {
        const item = chart.getSelection()[0];
        if (typeof item === 'undefined') {
            console.error("selectedItem is undefined!");
            return;
        }

        let job;
        if (item.row < user.resolvedJobs.length) {
            job = user.resolvedJobs[item.row];
        } else {
            job = user.openJobs[item.row - user.resolvedJobs.length];
        }

        if (typeof job === 'undefined') {
            console.error(`can't find job - row : ${item.row}, resolved: ${user.resolvedJobs.length}, opened: ${user.openJobs.length}`)
            return;
        }

        console.log("open: " + job.link);

        window.open(job.link, '_blank');
    });
}

function toJobArray(storiesArr) {
    return _(storiesArr).map((story, i) => {
        let start = story.startDate;
        let end = story.dueDate;

        console.log(`${story.key} - ${story.assignee} - ${start.format()} - ${end.format()}`);

        // fixme conditions...
        if (!MomentUtil.valid(start) && MomentUtil.valid(end)) {
            start = moment().startOf('week').subtract(1, 'weeks');
        }

        if (MomentUtil.valid(start) && !MomentUtil.valid(end)) {
            end = moment().endOf('week').add(1, 'weeks').add(1, 'hours');
        }

        if (!MomentUtil.valid(start) && !MomentUtil.valid(end)) {
            start = moment().startOf('week').subtract(1, 'weeks');
            end = moment().endOf('week').add(1, 'weeks');
        }

        start = MomentUtil.max(start, moment().startOf('week').subtract(1, 'weeks'));
        end = MomentUtil.min(end, moment().endOf('week').add(1, 'weeks')).endOf('day');

        start = MomentUtil.min(start, end);

        return [`${story.status}`, story.summary, start.toDate(), end.toDate()];
    }).sortBy([(s) => { return s[2].valueOf(); }, (s) => { return s[3].valueOf(); }]).value();
}

function generateHtml() {
    var html = `        
        <div id='guide' style='font-size: small; border:1px dashed; padding:10px;'>Timeline 표시 조건 : <br>
            <li>resolved : status is in (resolved, closed) && resolved date is between (지난주 시작일 and 오늘)</li>
            <li>open : status is NOT in (resolved, closed) && start date is empty or < 다음주 마지막 일 && due date is (NOT empty and > 지난주 시작일)</li>
        </div>
        <div id='link_to_search_result'></div>
        <div id='center_progress_div'>
            <p id='processing_flash' style='font-size:large; padding: 270px 0; text-align: center; color:red; font-weight:bold;'>.</p>            
        </div>
        <div id='people_div'>
            <table id='people_table' width=100%>
                <tbody id='first'>
                </tbody>
            </table>
        </div>
        `;

    $("#myCanvas").html(html);
}