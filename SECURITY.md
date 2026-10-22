# Security Policy

## Supported versions

Security fixes go into the latest release. Please update to the newest version before reporting, to check that the problem is still there.

| Version | Supported |
| ------- | --------- |
| Latest 1.x release | Yes |
| Older releases | No |

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it privately with GitHub: open the **Security** tab of this repository and choose **Report a vulnerability**. Only the maintainer can see the report.

Please include:

- what is wrong and what an attacker could do with it,
- the smallest piece of HTML, Markdown or code that shows it,
- the browser and version, and the version of Aurebesh.

You can expect a first answer within about a week. This is a small project maintained by one person, so I cannot promise a fixed time for a fix, but I will keep you informed and credit you in the release notes if you like.

Please give me a reasonable time to release a fix before you make the problem public.

## What counts

Aurebesh turns text that people type, paste or load into HTML. These are in scope:

- **Cross-site scripting (XSS)** through the sanitizer: HTML, a paste from Word or Google Docs, Markdown, `setHTML`, or a loaded value that runs script or loads something it should not (`javascript:` links, event attributes, unsafe `style` or `src` values, and so on).
- **Output that is unsafe by itself**: HTML, Markdown, Word (`.docx`) or print output that carries something the sanitizer should have removed.
- **A plugin or option** that lets content get around the sanitizer.

Not in scope:

- Problems that need the page itself to be malicious or already compromised.
- Problems in your own plugins, or in the way an application stores or shows the HTML (see below).
- Denial of service with very large input, unless a small input has a large effect.

## For people who use the editor

The sanitizer in the browser protects the editor. It does not replace **sanitizing on the server**: a visitor can send anything to your server without using the editor. Always sanitize the HTML again before you store or show it. The README has a section on this ("Security: sanitize on the server too").
