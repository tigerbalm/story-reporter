google.charts.load('current', {'packages':['timeline']});
google.charts.setOnLoadCallback(onGoogleLoadCallback);

function onGoogleLoadCallback() {
    console.log("google chart loaded");
    drawChart();
}

$(document).ready(() => {
    'use strict';
    
    console.log("doc ready");

    main();

    console.log("after main");
});

class Issue {
    constructor(key, type, status, assignee, summary, component, createdDate, dueDate, startDate, link) {
        this.key = key;
        this.type = type;
        this.status = status;
        this.assignee = assignee;
        this.summary = summary;
        this.component = component;
        this.createdDate = createdDate;
        this.dueDate = dueDate;
        this.startDate = startDate;
        this.link = link;
    }
}

class MyUrl {    
}

class SearchResult {    
    constructor(url) {
        this.url = url;
    }

    // return promise
    fetchAndParse() {
        return $.get(url.encodedUrl);
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
        return [new Issue("THNQNATIVE-181", "Bug", "Open", 
        "&#44608;&#51068;&#50689; ilyoung.kim", "Model Json&#50640; &#45824;&#54620; &#48516;&#49437;", 
        "SmartThinQ H&amp;A Service", "Tue, 5 Jun 2018 18:16:35 +0900", "Fri, 27 Jul 2018 00:00:00 +0900", 
        "Mon, 23 Jul 2018 00:00:00 +0900", "http://mlm.lge.com/di/browse/THNQNATIVE-181")];
    }
}

function main() {
    generateHtml();

    const url = new MyUrl();
    const searchResult = new SearchResult(url);
    const projects = searchResult.projects();    
    const issues = searchResult.issues({project: "all"});

    console.log(JSON.stringify(issues));
    
    addLinks("projects", projects, project => {
        // refresh all with project
        console.log(`Project "${project}" is selected.`);
    });

    addLinks("components", searchResult.components(), comp => {
        // refresh all with project
        console.log(`Component "${comp}" is selected.`);
    });
    
    drawChart("progress_barchart", issues);
}

function generateHtml() {
    var html = "<div id='projects'>projects div</div>" +
        "<div id='components'>component div</div>" +
        "<div id='progress_barchart'>progress_barchart</div>" +
        "<div id='calendar_chart'>calendar_chart</div>" +
        "<div id='timeline'></div>";

    $("#myCanvas").html(html);
}

function addLinks(id, items, onClick) {
    const text = items.map(item => `${item}`).join(" | ");
    $(`#${id}`).text(text);
}

function drawChart(id, issues) {
    var container = document.getElementById('timeline');
    var chart = new google.visualization.Timeline(container);
    var dataTable = new google.visualization.DataTable();

    dataTable.addColumn({ type: 'string', id: 'President' });
    dataTable.addColumn({ type: 'date', id: 'Start' });
    dataTable.addColumn({ type: 'date', id: 'End' });
    dataTable.addRows([
    [ 'Washington', new Date(1789, 3, 30), new Date(1797, 2, 4) ],
    [ 'Adams',      new Date(1797, 2, 4),  new Date(1801, 2, 4) ],
    [ 'Jefferson',  new Date(1801, 2, 4),  new Date(1809, 2, 4) ]]);

    chart.draw(dataTable);
}