// todo
// 3. timeline view 에서 과거는 resolved 만 / 미래는 open만 표시
// 5. url 작업 일관되게 변경
// 7. jql parser 만들기.. 그래도 component 는 다르게 해야 하지 않는지..
// 8. error 처리 (search query 에서 component 를 넣을지 말지.. 별도로도 처리가 가능한데..)
// 9. timeline graph 다시 그리기

// 1. 500개 이상 data 처리
// 2. interaction

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

    main2();
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

// key, {name: name, total:total}
let myProjectMap = new Map();

class ProjectMap {
    constructor() {
        this.map = new Map();
    }

    add(searchResult) {
        _(searchResult.stories())
            .groupBy(s => s.projectKey)
            .map((issues, key) => this.update(key, issues[0].projectName, issues.length))
            .value();
    }

    update(key, name, total) {
        if (this.map.has(key)) {
            const value = this.map.get(key);
            this.map.set(key, {name: name, total: (value.total + total)});    
            return;
        }

        this.map.set(key, {name: name, total: total});
    }

    get(key) {
        return this.map.get(key);
    }
}

class UserList {
    constructor() {
        this.users = new Map();
    }

    update(user) {
        
    }
}

let url;
let projects = new ProjectMap();
let stories = [];
let issues = {};

function main2() {
    generateHtml();
    
    url = new MyUrl(GLOBAL_BASE_URL, GLOBAL_JQL, 1);
    console.log("first fetch : " + url.searchUrl);

    $.get(url.searchUrl, 'xml').success(xmlDoc => {
        fetchData(xmlDoc);        
    })
    .error(err => $("#people_div").html(`
        <br>Error: ${err.statusText}(${err.status})
        <br>ResponseText: ${err.responseText}
    `));    
}

function fetchData(xmlDoc) {
    const result = new SearchResult(xmlDoc);
    const issues = result.issue();

    const loop = Math.ceil((issues.total) / 500);
    console.log(`total: ${issues.total}, loop: ${loop}`);

    const deferred = _.range(0, loop).map(p => $.Deferred());
 
    $.when.apply($, deferred).done(() => {
            const docs = arguments;
            _(docs).map(d => new SearchResult(d)).map(result => {
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

    const url2 = new MyUrl(GLOBAL_BASE_URL, GLOBAL_JQL, 500);
    _.range(0, loop).forEach((x, i) => {
        url2.setStartAt(issues.end * x);
            console.log("url: " + url2.searchUrl);

            $.get(url2.searchUrl, 'xml').success(xmlDoc => {                        
                deferred[i].resolve(xmlDoc);
            })
            .error(err => {
                $("#people_div").html(`
                <br>Error: ${err.statusText}(${err.status})
                <br>ResponseText: ${err.responseText}
                `)

                deferred[i].reject();
            });

            console.log("after $.get()");
        });

        console.log("end of range");
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
                        <td style='border-bottom: 1px solid #555;'>${user.name}</td>
                        <td style='border-bottom: 1px solid #555;'>${table}</td>
                    </tr>
                `);
        }
        
        return user;
    }).map(user => {        
        user.projectStats.forEach((v, k) => showPieChart2(projects.get(k), user.key, k, v));
        showTimelineChart(`timeline_${user.key}`, user);
    }).value();
}


let timelineMap = new Map();

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
        dataTable.addColumn({ type: 'string', id: 'Status' });
        dataTable.addColumn({ type: 'string', id: 'Summary' });
        //dataTable.addColumn({ type: 'string', role: 'tooltip' });
        dataTable.addColumn({ type: 'date', id: 'Start' });
        dataTable.addColumn({ type: 'date', id: 'Due' });
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
        timeline: { groupByRowLabel: false, colorByRowLabel: true }
    };

    chart.draw(dataTable, options);

    timelineMap.set(id, {chart: chart, dataTable: dataTable});
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
    }).value();
}

let pieChartMap = new Map();

function showPieChart2(projectInfo, userKey, projectKey, statusMap) {
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

    const tooltip = _.chain(_.values(statusMap)).flatMap(s => s).map(s => s.summary).join("\n").value();

    var data = new google.visualization.DataTable();
    data.addColumn('string', 'Who');
    data.addColumn('number', 'Jobs');
    data.addColumn({type: 'string', role: 'tooltip'});
    data.addRows([
        ['My jobs', myJobs, ""],
        ['Others', others, ""]
    ]);
    
    var options = {
        title: `${projectInfo.name} (${projectInfo.total})`,
        width: 400,
        height: 300,
        pieHole: 0.4,
        pieSliceText: 'value',
        slices: {  
            0: {offset: 0.2, color: '#9966ff'},
            1: {color: '#33cccc'}            
        },
        tooltip: { trigger: 'selection' }
    };

    function selectHandler() {
        // var selectedItem = chart.getSelection()[0];
        // if (selectedItem) {
        //   var value = data.getValue(selectedItem.row, selectedItem.column);
        //   //alert('The user selected ' + value);
        // }
      }

      google.visualization.events.addListener(chart, 'select', selectHandler);

    const mlmKeys = _.chain(_.values(statusMap)).flatMap(s => s).map(s => s.key).join(",").value();
    chart.setAction({
        id: 'sample',
        text: 'Show issues',
        action: function() {
          const selection = chart.getSelection();
          switch (selection[0].row) {
            case 0: 
                window.open("http://mlm.lge.com/di/secure/IssueNavigator.jspa?reset=true?reset=true&jqlQuery=key in(" + mlmKeys + ")", '_blank');
                break;
            case 1: 
                //alert('Feynman Lectures on Physics'); 
                break;            
          }
        }
      });

    chart.draw(data, options);

    pieChartMap.set(id, {chart: chart, myJobs: myJobs});
}

function genTable(user) {    
    return `<table width=100% id='worktable_${user.key}'>
                <tr>
                    <div id='pie_${user.key}'></div>
                </tr>
                <tr>
                    <td id='timeline_${user.key}'></td>
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