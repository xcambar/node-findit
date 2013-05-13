var assert = require('assert');
var find = require('../');

exports.module = function () {
    assert.eql(find.findSync, find.find.sync);
    assert.eql(find, find.find);
};

exports.file = function () {
    var to = setTimeout(function () {
        assert.fail('never ended');
    }, 5000);

    var finder = find(__filename);
    var files = [];
    finder.on('file', function (file) {
        assert.equal(file, __filename);
        files.push(file);
    });

    finder.on('directory', function (dir) {
        assert.fail(dir);
    });

    finder.on('end', function () {
        clearTimeout(to);
        assert.deepEqual(files, [ __filename ]);
    });
};

exports.unknown_file = function () {
    var to = setTimeout(function () {
        assert.fail('never ended');
    }, 5000);


    var finder = find(__dirname + '/dunno');
    finder.on('error', function (err) {
      assert.ok(err instanceof Error);
    });
    finder.on('end', function () {
        clearTimeout(to);
        assert.ok('should be called even for an error');
    });
};

exports.file_as_root = function () {
    var _pathCalled, _fileCalled, to = setTimeout(function () {
        assert.fail('never ended');
    }, 5000);


    var finder = find(__dirname + '/foo/x');
    finder.on('file', function () {
        _fileCalled = true;
    });
    finder.on('path', function () {
        _pathCalled = true;
    });
    finder.on('end', function () {
        clearTimeout(to);
        assert.ok(_pathCalled === true);
        assert.ok(_fileCalled === true);
    });
};

