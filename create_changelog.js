'use strict';

class GitLab {
    constructor(baseURI, privateToken) {
        this.request = require('request-promise');
        this.baseURI = `${baseURI}/api/v4/projects`;
        this.options = {
            json: true,
            headers: {
                'content-type' : 'text/json',
                'private-token': privateToken
            }
        };
    }
    
    getProjects(_nameForSearch) {
        this.options.uri = this.baseURI + '?simple=true';
    
        if (_nameForSearch) {
            this.options.uri += `&search=${encodeURIComponent(_nameForSearch)}`;
        }

        return this.request(this.options);
    }
    
    setProject(project) {
        this.project = project;
    }

    getTags() {
        this.validate();

        this.options.uri = this.baseURI + `/${this.project.id}/repository/tags`;

        return this.request(this.options);
    }

    getCommits(_tagName) {
        this.validate();

        this.options.uri = this.baseURI + `/${this.project.id}/repository/commits`;

        if (_tagName) {
            this.options.uri += `?ref_name=${encodeURIComponent(_tagName)}`;
        }

        return this.request(this.options);
    }

    getMergeRequests() {
        this.validate();

        this.options.uri = this.baseURI + `/${this.project.id}/merge_requests?state=merged`;

        return this.request(this.options);
    }

    validate() {
        if (!this.project) {
            throw 'Please set a project before doing any operations';
        }
    }
}

function print(text) {
    console.log(text);
}

function printCommits(projectName, versionName, versionDate, commits) {
    print('=================================================');
    print(`${projectName} - ${versionName} (Released ${versionDate.getFullYear()}-${versionDate.getMonth()+1}-${versionDate.getDate()})`);

    for (let i =0; i < commits.length; i++) {
        if (!commits[i].title.startsWith('Merge branch')) {
            print(`\t${commits[i].title}`);
        }
    }

    print('\n');
}

function showHelp(args) {
    print(`Usage: ${args[0]} ${args[1]} gitlab_url gitlab_project gitlab_private_token [--release_indicator ri]`);
    print(`Example: ${args[0]} ${args[1]} http://example.gitlab.com myGitLabProject yAS8Kkmdcma2fjw09e --release_indicator tags`);
    print('');
    print('Possible values for release_indicator are: merge_requests and tags. Default is tags');
    print('If tags is selected as the release indicator, each release in the changelog is a GitLab tag, and the release content is the commits in that tag');
    print('If merge_requests s is selected as the release indicator, each release in the changelog is a Merge Request to the branch Master (that is actually merged), and the release content is the commits in that merge request');
}

function sortAndPrintReleases(releases, projectName) {
    releases = releases.sort((a, b) => a.release.releaseDate - b.release.releaseDate);
    for (let i =0; i < releases.length; i++) {
        printCommits(projectName, releases[i].release.versionName, releases[i].release.releaseDate, releases[i].commits);
    }
}

function retriveByTags(gitlab) {
    gitlab.getTags().then((tags) => {
        const allPromises = [];

        for (let i = 0; i < tags.length; i++) {
            const currentTag = tags[i];
            allPromises.push(gitlab.getCommits(currentTag.name));
        }

        Promise.all(allPromises).then((allCommits) => { 
            const releases = [];

            for (let i = 0; i < allCommits.length; i++) {
                const commits = allCommits[i];

                let currentTag = null;
                for (let j = 0; j < tags.length && currentTag === null; j++) {
                    if (tags[j].commit.id === commits[0].id) {
                        currentTag = tags[j];
                    }
                }

                if (currentTag !== null) {
                    currentTag.releaseDate = new Date(currentTag.commit.committed_date);
                    currentTag.versionName = currentTag.name;
                    releases.push({release: currentTag, commits: commits});
                }
            }

            sortAndPrintReleases(releases, gitlab.project.name);
        });
    });
}

function retrieveByMergeRequests(gitlab) {
    gitlab.getMergeRequests().then((mrs) => {
        const allPromises = [];

        for (let i = 0; i < mrs.length; i++) {
            const currentMR = mrs[i];
            if (currentMR.target_branch === 'master') {
                allPromises.push(gitlab.getCommits(currentMR.source_branch));
            }
        }

        Promise.all(allPromises).then((allCommits) => { 
            const releases = [];

            for (let i = 0; i < allCommits.length; i++) {
                const commits = allCommits[i];

                let currentMR = null;
                for (let j = 0; j < mrs.length && currentMR === null; j++) {
                    if (mrs[j].sha === commits[0].id) {
                        currentMR = mrs[j];
                    }
                }

                if (currentMR !== null) {
                    currentMR.releaseDate = new Date(currentMR.created_at);
                    currentMR.versionName = currentMR.source_branch;
                    releases.push({release: currentMR, commits: commits});
                }
            }

            sortAndPrintReleases(releases, gitlab.project.name);
        });
    });
}

const args = process.argv;

if (args.length !== 5 && args.length !== 7) {
    showHelp(args);

} else {
    const GITLAB_URL = args[2];
    const PROJECT_NAME = args[3];
    const PRIVATE_TOKEN = args[4];

    let retriever = 'tags';

    if (args.length === 7 && args[6] === 'merge_requests') {
        retriever = 'merge_requests';
    } else {
        print('Using tags as release indicator');
    }

    const gitlab = new GitLab(GITLAB_URL, PRIVATE_TOKEN);

    gitlab.getProjects(PROJECT_NAME).then((projectsFound) => {
        for(let i = 0 ; i < projectsFound.length; i++) {
            if (projectsFound[i].name === PROJECT_NAME) {
                gitlab.setProject(projectsFound[i]);
                break;
            }
        }

        if (retriever === 'tags') {
            retriveByTags(gitlab);

        } else {
            retrieveByMergeRequests(gitlab);
        }
    }).catch((error) => {console.error(error)});    
}
