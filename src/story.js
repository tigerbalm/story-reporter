import moment from 'moment';

class Story {
    constructor(item) {
        const $item = $(item);

        this.key = $item.find('key').text() || "";
        this.projectKey = $item.find('project').attr('key') || "";
        this.projectName = $item.find('project').text() || "";
        this.type = $item.find('type').text() || "";
        this.status = this._status($item.find('status').text() || "");
        this.assignee = $item.find('assignee').text() || "";
        this.username = $item.find('assignee').attr('username') || "";
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

export default Story;