import 'lodash';
import moment from 'moment';
import MomentUtil from './moment_util.js';

class UserStat {
    constructor(name, stories) {
        this.name = name;
        this.key = name.replace(/[^A-Za-z]/g, "");

        this.projectStats = new Map();
        _(stories).chain().groupBy(s => s.projectKey)
            .map((group, key) => {
                const groupByStatus = _(group).chain().groupBy(s => s.status)
                    .value();
                // const statusMap = new Map();

                // _.forIn(groupByStatus, (v, k) =>
                //     statusMap.set(k, v.length));
 
                this.projectStats.set(key, groupByStatus);
            }).value();

        // resolved job - due / resolved is in prev_week
        this.resolvedJobs = _(stories).chain()
                                    .filter(s => s.status === "resolved")
                                    .filter(s => MomentUtil.valid(s.dueDate))
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
        return !MomentUtil.valid(date) || date.isBefore(this._datesUpperBoundary());
    }

    _vaildEndDate(date) {
        return MomentUtil.valid(date) && date.isAfter(this._datesLowerBoundary());
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
}

export default UserStat;