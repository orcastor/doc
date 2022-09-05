module.exports = {
    locales: {
        '/': {
            lang: 'zh-CN',
            title: 'OrcaS',
            description: '一款开箱即用的轻量级对象存储'
        },
        /*'/en/': {
            lang: 'en-US', // 将会被设置为 <html> 的 lang 属性
            title: 'OrcaS',
            description: 'An out-of-box, light weight object storage'
        },*/
    },
    title: 'OrcaS',
    description: 'An out-of-box, light weight object storage',
    base: "/doc/",
    head: [
        ['link', { rel: 'icon', href: '/favicon.ico' }],
        [
            "meta",
            {
                name: "keywords",
                content: "orcas,object,storage,opensource",
            },
        ],
    ],
    markdown: {
        lineNumbers: true, // 代码块显示行号
    },
    themeConfig: {
        logo: '/logo.svg',
        locales: {
            '/': {
                nav: [
                    {
                        text: "首页",
                        link: "/",
                    },
                    {
                        text: "文档",
                        link: "/orcas/",
                    },
                    {
                        text: "GitHub",
                        link: "https://github.com/orcastor/orcas",
                    },
                ],
                // 假定是 GitHub. 同时也可以是一个完整的 GitLab URL
                repo: 'orcastor/orcas',
                // 自定义仓库链接文字。默认从 `themeConfig.repo` 中自动推断为
                // "GitHub"/"GitLab"/"Bitbucket" 其中之一，或是 "Source"。
                repoLabel: 'OrcaS源码',
                // 假如你的文档仓库和项目本身不在一个仓库：
                docsRepo: 'orcastor/doc',
                // 假如文档不是放在仓库的根目录下：
                docsDir: 'docs',
                // 假如文档放在一个特定的分支下：
                docsBranch: 'master',
                // 默认是 false, 设置为 true 来启用
                editLinks: true,
                // 默认为 "Edit this page"
                editLinkText: '帮助我们改善此页面！',
                sidebar: {
                    "/orcas/": [
                        {
                            title: "从0开始设计对象存储",
                            collapsable: false, // 可选的, 默认值是 true,
                            children: [
                                "/orcas/",
                                "/orcas/DESIGN.md",
                                "/orcas/FAQ.md",
                            ],
                        },
                    ]
                },
                sidebarDepth: 1,
                lastUpdated: "上次更新",
                serviceWorker: {
                    updatePopup: {
                        message: "发现新内容可用",
                        buttonText: "刷新",
                    },
                },
            },
        },
    },
    plugins: [
        [
            "@vuepress/last-updated",
            {
                transformer: (timestamp, lang) => {
                    const moment = require("moment");
                    moment.locale("zh-cn");
                    return moment(timestamp).format("YYYY-MM-DD HH:mm:ss");
                },
                dateOptions: {
                    hours12: true,
                },
            },
        ],
        "@vuepress/back-to-top",
        "@vuepress/active-header-links",
        "@vuepress/medium-zoom",
        "@vuepress/nprogress",
    ],
}