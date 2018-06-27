// todo
// 3. timeline view 에서 과거는 resolved 만 / 미래는 open만 표시
// 5. url 작업 일관되게 변경
// 7. jql parser 만들기.. 그래도 component 는 다르게 해야 하지 않는지..
// 8. error 처리 (search query 에서 component 를 넣을지 말지.. 별도로도 처리가 가능한데..)
// 9. timeline graph 다시 그리기

import MomentUtil from './moment_util.js';
import MyUrl from './url.js';
import UserStat from './user_stat.js';
import SearchResult from './search_result.js';
import 'lodash';
import moment from 'moment';
import {GoogleCharts} from 'google-charts';

GoogleCharts.load(() => {
    console.log("google chart loaded");
    
    startProgress();    

    $.ajaxSetup({
        xhrFields: {
            withCredentials: true
        }
    });

    main();
}, ['timeline', 'corechart']);

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

let myProjectMap = new Map();

function main() {
    'use strict';

    generateHtml();

    const deferred = _(GLOBAL_PROJECTS).map(p => $.Deferred()).value();    

    $.when.apply($, deferred).then(
        function success() {
            const docs = arguments;
            _(docs).map(d => new SearchResult(d)).map(r => {
                const total = r.issue().total;
                const key = r.stories()[0].projectKey;
                const dispName = r.stories()[0].projectName;

                log(`Build project map : ${key}, ${dispName}, ${total}`);

                myProjectMap.set(key, {total: total, dispName: dispName});
            }).value();

            displayMain();
        },

        function failed(results) {
        }
    );

    _(GLOBAL_PROJECTS).map((p, i) => {
        let baseUrl = GLOBAL_BASE_URL;
        if (location.hostname.startsWith("localhost")) {
            baseUrl = `http://localhost:8080/xml/search-result-prj-${p}.xml`;
        }

        let components = "";
        if (typeof GLOBAL_COMPONENTS !== 'undefined' && GLOBAL_COMPONENTS) {
            const compString = _(GLOBAL_COMPONENTS[i]).map(c => `"${c}"`).value().join(',');
            components = `component in (${compString})`;
        }
        
        const query = `project = ${p} AND ${components}`;

        return new MyUrl(baseUrl, query, 1, 'project').searchUrl;
    }).map((q, i) => {
        console.log(`${i}: ` + q);

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
    const url = new MyUrl(GLOBAL_BASE_URL, GLOBAL_JQL);
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

        return [`${story.status}`, story.summary, start.toDate(), end.toDate()];
    }).value();
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