<div style="text-align: center">

![Pxls](https://i.imgur.com/udeloqX.png)

![Gulp CI](https://img.shields.io/github/actions/workflow/status/pxlsspace/pxls-web/gulp.yml?style=flat-square)
[![GitHub issues](https://img.shields.io/github/issues/pxlsspace/pxls-web?style=flat-square)](https://github.com/pxlsspace/pxls-web/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr/pxlsspace/pxls-web?style=flat-square)](https://github.com/pxlsspace/pxls-web/pulls)
[![GitHub contributors](https://img.shields.io/github/contributors/pxlsspace/pxls-web?style=flat-square)](https://github.com/pxlsspace/pxls-web/graphs/contributors)
[![GitHub stars](https://img.shields.io/github/stars/pxlsspace/pxls-web?style=flat-square)](https://github.com/pxlsspace/pxls-web/stargazers)

</div>

Pxls is a collaborative canvas where users can place one pixel from a limited palette at a time, inspired by Reddit's [r/Place][place] experiment.

This repository holds the front end web client. The back end can be found [here][backend].

# Installation

Automatically built files are available as artifacts on each push [here][actions].

## Building

The following are required on both the **build** and **target** system(s):

* [Node.js](https://nodejs.org/en/) (LTS or newer)

Install dependencies with `npm install`.

To build, run `npm run build` in the project root.

## Running

Copy the reference `config.example.json5` to `config.json5` and edit as necessary.

Run with `npm start`.

# Licenses
- This project includes icons from Font Awesome Free 5.9.0 by fontawesome - https://fontawesome.com
    - License: https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License)


[place]: https://reddit.com/r/place/
[backend]: https://github.com/pxlsspace/Pxls/
[actions]: https://github.com/pxlsspace/pxls-web/actions/workflows/gulp.yml
