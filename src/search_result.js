import 'lodash';
import Story from './story.js';

class SearchResult {
    constructor(xmlDoc) {
        this._issue = {};
        this._stories = [];

        this._parseXmlDoc(xmlDoc);
    }

    _parseXmlDoc(xml) {
        const $xml = $(xml);
        this._link = $(xml).find("channel > link").text();
        this._parseIssueCount($xml.find("issue"));
        this._parseItems($xml.find("item"));
    }

    _parseIssueCount(issueNode) {
        this._issue.total = parseInt(issueNode.attr("total"));
        this._issue.start = parseInt(issueNode.attr("start"));
        this._issue.end = parseInt(issueNode.attr("end"));
    }

    _parseItems(xmlitems) {
        console.log(`xmlitems : ${xmlitems.length}`);
        
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

    link() {
        return this._link;
    }
}

export default SearchResult;