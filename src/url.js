import moment from 'moment';

const Constants = {
    base_url: 'http://mlm.lge.com/di/sr/jira.issueviews:searchrequest-xml/temp/SearchRequest.xml',
    fields: [
            'project', 'summary', 'link', 'assignee', 'status', 'component', 'due', "created",
            'type', "customfields", "resolved", "customfield_12045", "customfieldvalues"
    ],
    jql: 'project in (LIFETRACK)'
};

class MyUrl {
    constructor(base, jql, max, fields) {
        this.baseUrl = this._baseUrl(base);
        this.jqlQuery = this._buildJql(jql);
        this.preferredFields = this._buildFields(fields);
        this.tempMax = max || 1000;
        this.searchUrl = this._buildSearchUrl();

        console.log("searchUrl: " + this.searchUrl);
    }

    _baseUrl(base) {        
        if (base) {
            console.log("found base url: " + base);
            return base;
        }

        return Constants.base_url;
    }

    _buildJql(jql) {
        if (jql) {
            console.log("found jql: " + jql);

            const start = moment().startOf('year').format('YYYY-MM-DD');
            const end = moment().endOf('year').format('YYYY-MM-DD');

            return `${jql} AND created >= ${start} AND created <= ${end} AND assignee not in (unassigned)`;
        }

        return Constants.jql;
    }

    _buildFields(fields) {
        if (fields) {
            if(!Array.isArray(fields)) {
                fields=[fields];
            }

            return fields.map(item => "field=" + item).join("&");
        }
        
        return Constants.fields.map(item => "field=" + item).join("&");
    }

    _buildSearchUrl() {
        const params = {
            jqlQuery: this.jqlQuery,
            tempMax: this.tempMax
        };

        return this.baseUrl + "?" + $.param(params) + "&" + this.preferredFields;
    }
}

export default MyUrl;