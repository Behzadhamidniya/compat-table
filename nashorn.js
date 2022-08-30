/*
 *  Node.js test runner for running data-*.js tests with Nashorn 'jjs' command
 *  running in es6 mode (a.k.a.: jjs --language=es6).
 * 
 *  If the environment variable JAVA_HOME is defined it will use it to
 *  construct the path to 'jjs' as $JAVA_HOME/bin/jjs
 *
 *  Reports discrepancies to console; fix them manually in data-*.js files.
 *  Expects a 'jjs' command in the path.  Example:
 *
 *    $ node nashorn.js
 */

var fs = require('fs');
var path = require('path');
var child_process = require('child_process');
var runner_support = require('./runner_support');

var testCount = 0;
var testSuccess = 0;
var testOutOfDate = 0;

var jjsCommand = 'jjs';

var jdkBin = '';
// if JAVA_HOME is set then resolve to the bin
if (process.env.JAVA_HOME) {
    var jdkBin = path.resolve(process.env.JAVA_HOME, 'bin');
    jjsCommand = path.resolve(jdkBin, 'jjs');
}

// Key for .res (e.g. test.res.nashorn), automatic based on nashorn version.
var jjsKey = (function () {
    var script = 'print(java.lang.System.getProperty("java.specification.version"));\n' +
                 'quit()\n';

    fs.writeFileSync('jjstest.js', script);
    var stdout = child_process.execFileSync(jjsCommand, [ '--language=es6', 'jjstest.js' ], {
        encoding: 'utf-8'
    });

    console.log('jjs version is: ' + stdout);
    return stdout.replace('.', '_');
})();
console.log('jjs result key is: test.res.nashorn' + jjsKey);

// List of keys for inheriting results from previous versions.
var jjsKeyList = runner_support.keyList(jjsKey, 'Nashorn');
console.log('jjs key list for inheriting results is:', jjsKeyList);

// Run test / subtests, recursively.  Report results, indicate data files
// which are out of date.
function runTest(parents, test, sublevel) {
    var testPath = parents.join(' -> ') + ' -> ' + test.name;

    if (typeof test.exec === 'function') {
        var src = test.exec.toString();
        var m = /^function\s*\w*\s*\(.*?\)\s*\{\s*\/\*([\s\S]*?)\*\/\s*\}$/m.exec(src);
        var evalcode;
        if (m) {
            evalcode = '(function test() {' + m[1] + '})();';
        } else {
            evalcode = '(' + src + ')()';
        }
        //console.log(evalcode);

        var script = 'var evalcode = ' + JSON.stringify(evalcode) + ';\n' +
                     'try {\n' +
                     '    var res = eval(evalcode);\n' +
                     '    if (res !== true && res !== 1) { throw new Error("failed: " + res); }\n' +
                     '    print("[SUCCESS]");\n' +
                     '} catch (e) {\n' +
                     '    print("[FAILURE] " + e);\n' +
                     '    /*throw e;*/\n' +
                     '}\n';

        fs.writeFileSync('jjstest.js', script);
        var stdout = child_process.execFileSync(jjsCommand, [ '--language=es6', 'jjstest.js' ], {
            encoding: 'utf-8'
        });
        //console.log(stdout);

        var success = false;
        if (/^\[SUCCESS\]$/gm.test(stdout)) {
            success = true;
            testSuccess++;
        } else {
            //console.log(stdout);
        }
        testCount++;

        if (test.res) {
            // Take expected result from newest jjs version not newer
            // than current version.
            var expect = void 0;
            jjsKeyList.forEach(function (k) {
                if (test.res[k] !== void 0) {
                    expect = test.res[k];
                }
            });

            if (expect === success) {
                // Matches.
            } else if (expect === void 0 && !success) {
                testOutOfDate++;
                console.log(testPath + ': test result missing, res: ' + expect + ', actual: ' + success);
            } else {
                testOutOfDate++;
                console.log(testPath + ': test result out of date, res: ' + expect + ', actual: ' + success);
            }
        } else {
            testOutOfDate++;
            console.log(testPath + ': test.res missing');
        }
    }
    if (test.subtests) {
        var newParents = parents.slice(0);
        newParents.push(test.name);
        test.subtests.forEach(function (v) { runTest(newParents, v, sublevel + 1); });
    }
}

for (var suitename in runner_support.suites) {
    var testsuite = runner_support.suites[suitename];
    console.log('');
    console.log('**** ' + suitename + ' ****');
    console.log('');
    testsuite.tests.forEach(function (test) {
        runTest([ suitename ], test);
    });
}

console.log(testCount + ' tests executed: ' + testSuccess + ' success, ' + (testCount - testSuccess) + ' fail');
console.log(testOutOfDate + ' tests are out of date (data-*.js file .res)');
