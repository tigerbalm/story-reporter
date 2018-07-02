import {groupBy, map} from 'lodash';

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
            this.map.set(key, {
                name: name,
                total: (value.total + total)
            });
            return;
        }

        this.map.set(key, {
            name: name,
            total: total
        });
    }

    get(key) {
        return this.map.get(key);
    }
}

export default ProjectMap;