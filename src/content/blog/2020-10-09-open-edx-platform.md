---
title: "Working with Open edX: Custom XBlocks and Tutor Deployment"
description: "Lessons from building on top of one of the world's largest open-source LMS platforms — Django internals, XBlock development, and Tutor-based deployments."
pubDate: 2020-10-09
lang: en
translationKey: open-edx-platform
category: devops
tags: ["python", "django", "open-edx", "docker", "lms"]
draft: false
---

Open edX is the open-source LMS that powers edX.org, MIT OpenCourseWare, and thousands of other platforms worldwide. It's also one of the most complex Django applications you'll ever work with.

This post covers what I learned building custom XBlocks and deploying with Tutor.

## What Is an XBlock?

XBlocks are the core content unit in Open edX — think of them as custom interactive components that plug into the course runtime. A video player is an XBlock. A quiz is an XBlock. And when you need something custom — a simulation, a live coding environment, an embedded tool — you build an XBlock.

The XBlock API is well-defined but not well-documented. The best way to understand it is to read existing blocks:

```python
import pkg_resources
from xblock.core import XBlock
from xblock.fields import Integer, Scope, String
from xblock.fragment import Fragment


class CounterXBlock(XBlock):
    """A simple counter block — useful as a minimal working example."""

    count = Integer(
        default=0,
        scope=Scope.user_state,
        help="How many times the user has clicked the button",
    )

    label = String(
        default="Click me",
        scope=Scope.content,
        help="Button label text",
    )

    def student_view(self, context=None):
        html = self.resource_string("static/html/counter.html")
        frag = Fragment(html.format(self=self))
        frag.add_css(self.resource_string("static/css/counter.css"))
        frag.add_javascript(self.resource_string("static/js/counter.js"))
        frag.initialize_js("CounterXBlock")
        return frag

    @XBlock.json_handler
    def increment(self, data, suffix=""):
        self.count += 1
        return {"count": self.count}

    @staticmethod
    def workbench_scenarios():
        return [("Counter", "<counter/>")]
```

Key things to understand:

- **Scopes** determine where data is stored: `Scope.user_state` is per-user, `Scope.content` is per-block-instance.
- **Views** (`student_view`, `studio_view`) return `Fragment` objects containing HTML + JS + CSS.
- **Handlers** are AJAX endpoints decorated with `@XBlock.json_handler`.

## Tutor: The Sane Way to Deploy Open edX

The official Open edX native installation is painful. Tutor is a Docker-based deployment tool that wraps the complexity into manageable commands:

```bash
# Install Tutor
pip install "tutor[full]"

# Initialize the environment
tutor local quickstart

# Create an admin user
tutor local do createuser --staff --superuser admin admin@example.com

# Start the platform
tutor local start
```

Tutor uses a plugin system for customizations. If you need to override a template or add a pip package, you write a plugin instead of modifying Tutor's source directly:

```python
# myplugin/plugin.py
from tutor import hooks

hooks.Filters.ENV_PATCHES.add_item(
    ("openedx-lms-production-settings", """
FEATURES["ENABLE_COURSEWARE_MICROFRONTEND"] = True
""")
)
```

## What I Learned

Working with a codebase of this scale teaches things you can't learn from toy projects:

1. **Read before you write.** Open edX has strong internal conventions. Violations cause subtle bugs that are hard to trace.

2. **Minimal changes.** The more you diverge from upstream, the harder upgrades become. A 10-line patch that hooks into the right extension point beats a 200-line override.

3. **Test with real data.** The platform behaves differently with realistic course content, real user counts, and actual video assets. Unit tests are necessary but not sufficient.

4. **Docker is not optional.** Managing the service graph (LMS, CMS, Celery workers, MySQL, MongoDB, Redis, Elasticsearch) without containers is an exercise in pain.

The platform is not elegant — it's a decade of accumulated decisions, some good and some not. But it works at enormous scale, and learning to navigate it made me a better engineer.
