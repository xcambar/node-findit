var fs = require('fs');
var path = require('path');
var EventEmitter = require('events').EventEmitter;
var Seq = require('seq');

function createInodeChecker() {
    var inodes = {};
    return function inodeSeen(inode) {
        if (inodes[inode]) {
            return true;
        } else {
            inodes[inode] = true;
            return false;
        }
    }
}

function depth (options) {
  options = options || {};
  var max = !options.hasOwnProperty('maxDepth') ? Infinity : (isNan(+options.maxDepth) ? Infinity : options.maxDepth),
      min = !options.hasOwnProperty('minDepth') ? 0 : (isNan(+options.minDepth) ? 0 : options.minDepth),
      _depth;
  if (options.hasOwnProperty('depth')) {
    if (!options.depth) {
      _depth = 0;
    }
    if (isNaN(+options.depth)) {
      throw new TypeError('invalid depth given.');
    } else {
      _depth = +options.depth;
      max = _depth;
      min = _depth;
    }
  }
  return {
    quit: function (d) {
      return d > max;
    },
    valid: function (d) {
      return d >= min && d <= max;
    }
  }
}

exports = module.exports = find;
exports.find = find;
function find (base, options, cb) {
    cb = arguments[arguments.length - 1];
    if (typeof(cb) !== 'function') {
        cb = undefined;
    }
    var depthCheck = depth(options);
    var em = new EventEmitter;
    var inodeSeen = createInodeChecker();

    function finder (dir, d, f) {
        Seq()
            .seq(fs.readdir, dir, Seq)
            .flatten()
            .seqEach(function (file) {
                var p = dir + '/' + file;
                fs.lstat(p, this.into(p));
            })
            .seq(function () {
                this(null, Object.keys(this.vars));
            })
            .flatten()
            .seqEach(function (file) {
                var stat = this.vars[file];
                var isValid = depthCheck.valid(d);
                if (cb && isValid) cb(file, stat);

                if (inodeSeen(stat.ino)) {
                    // already seen this inode, probably a recursive symlink
                    this(null);
                }
                else {
                    if (isValid || stat.isDirectory()) {
                      em.emit('path', file, stat);
                    }

                    if (stat.isSymbolicLink()) {
                        if (isValid) {
                          em.emit('link', file, stat);
                        }
                        if (options && options.follow_symlinks) {
                          path.exists(file, function(exists) {
                            if (exists) {
                              fs.readlink(file, function(err, resolvedPath) {
                                if (err) {
                                  em.emit('error', err);
                                } else {
                                  finder(path.resolve(path.dir(file), d, resolvedPath));
                                }
                              });
                            }
                          });
                        } else {
                          this(null);
                        }
                    }
                    else if (stat.isDirectory()) {
                        em.emit('directory', file, stat);
                        if (!depthCheck.quit(d + 1)) {
                          finder(file, d + 1, this);
                        }
                    }
                    else {
                        if (isValid) {
                          em.emit('file', file, stat);
                        }
                        this(null);
                    }
                }
            })
            .seq(f.bind({}, null))
            .catch(em.emit.bind(em, 'error'))
        ;
    }

    if (depthCheck.quit(0)) {
      em.emit('end');
    } else {
      fs.lstat(base, function (err, s) {
          if (err) {
            em.emit('error', err);
            return em.emit('end');
          }
          var isDir = s.isDirectory();
          if(depthCheck.valid(0)) {
            if (cb) cb(base, s);
            em.emit('path', base, s);
            var eventName = isDir ? 'directory' : (s.isSymbolicLink() ? 'link' : 'file');
            em.emit(eventName, base, s);
          }
          if (isDir && depthCheck.valid(1)) {
            finder(base, 1, em.emit.bind(em, 'end'));
          } else {
            em.emit('end');
          }
      });
    }

    return em;
};

exports.findSync = function findSync(dir, options, callback) {
    cb = arguments[arguments.length - 1];
    if (typeof(cb) !== 'function') {
        cb = undefined;
    }
    var inodeSeen = createInodeChecker();
    var files = [];
    var fileQueue = [];
    var processFile = function processFile(file) {
        var stat = fs.lstatSync(file);
        if (inodeSeen(stat.ino)) {
            return;
        }
        files.push(file);
        cb && cb(file, stat)
        if (stat.isDirectory()) {
            fs.readdirSync(file).forEach(function(f) { fileQueue.push(path.join(file, f)); });
        } else if (stat.isSymbolicLink()) {
            if (options && options.follow_symlinks && path.existsSync(file)) {
                fileQueue.push(fs.realpathSync(file));
            }
        }
    };
    /* we don't include the starting directory unless it is a file */
    var stat = fs.lstatSync(dir);
    if (stat.isDirectory()) {
        fs.readdirSync(dir).forEach(function(f) { fileQueue.push(path.join(dir, f)); });
    } else {
        fileQueue.push(dir);
    }
    while (fileQueue.length > 0) {
        processFile(fileQueue.shift());
    }
    return files;
};

exports.find.sync = exports.findSync;
