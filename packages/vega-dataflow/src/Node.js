var DEPS = require('./Dependencies').ALL,
    nodeID = 1;

function Node(graph) {
  if (graph) this.init(graph);
}

var Flags = Node.Flags = {
  Router:     0x01, // Responsible for propagating tuples, cannot be skipped.
  Collector:  0x02, // Holds a materialized dataset, pulse node to reflow.
  Revises:    0x04, // Node requires tuple previous values.
  Batch:      0x08  // Node performs batch data processing, needs collector.
};

var prototype = Node.prototype;

prototype.init = function(graph) {
  this._id = nodeID++;
  this._graph = graph;
  this._rank = graph.rank(); // For topologial sort
  this._stamp = 0;  // Last stamp seen

  this._listeners = [];
  this._registered = {}; // To prevent duplicate listeners

  // Initialize dependencies.
  this._deps = {};
  for (var i=0, n=DEPS.length; i<n; ++i) {
    this._deps[DEPS[i]] = [];
  }

  // Initialize status flags.
  this._flags = 0;

  return this;
};

prototype.rank = function() {
  return this._rank;
};

prototype.last = function(stamp) { 
  if (!arguments.length) return this._stamp;
  this._stamp = stamp;
  return this;
};

// -- status flags ---

prototype._setf = function(v, b) {
  if (b) { this._flags |= v; } else { this._flags &= ~v; }
  return this;
};

prototype.router = function(state) {
  if (!arguments.length) return (this._flags & Flags.Router);
  return this._setf(Flags.Router, state);
};

prototype.collector = function(state) {
  if (!arguments.length) return (this._flags & Flags.Collector);
  return this._setf(Flags.Collector, state);
};

prototype.revises = function(state) {
  if (!arguments.length) return (this._flags & Flags.Revises);
  return this._setf(Flags.Revises, state);
};

prototype.batch = function(state) {
  if (!arguments.length) return (this._flags & Flags.Batch);
  return this._setf(Flags.Batch, state);
};

prototype.dependency = function(type, deps) {
  var d = this._deps[type];

  if (arguments.length === 1) {
    return d;
  }

  if (deps === null) {
    // Clear dependencies of the given type
    d.splice(0, d.length);
  } else if (!Array.isArray(deps)) {
    if (d.indexOf(deps) < 0) { d.push(deps); }
  } else {
    // TODO: singleton case checks for inclusion already
    // Should this be done here as well?
    d.push.apply(d, deps);
  }

  return this;
};

prototype.listeners = function() {
  return this._listeners;
};

prototype.addListener = function(l) {
  if (!(l instanceof Node)) {
    throw Error('Listener is not a Node');
  }
  if (this._registered[l._id]) return this;

  this._listeners.push(l);
  this._registered[l._id] = 1;
  if (this._rank > l._rank) {
    var q = [l],
        g = this._graph, cur;
    while (q.length) {
      cur = q.shift();
      cur._rank = g.rank();
      q.push.apply(q, cur.listeners());
    }
  }

  return this;
};

prototype.removeListener = function(l) {
  var idx = this._listeners.indexOf(l),
      b = idx >= 0;

  if (b) {
    this._listeners.splice(idx, 1);
    this._registered[l._id] = null;
  }
  return b;
};

prototype.disconnect = function() {
  this._listeners = [];
  this._registered = {};
};

// Evaluate this dataflow node for the current pulse.
// Subclasses should override to perform custom processing.
prototype.evaluate = function(pulse) {
  return pulse;
};

// Should this node be re-evaluated for the current pulse?
// Searches pulse to see if any dependencies have updated.
prototype.reevaluate = function(pulse) {
  var prop, dep, i, n, j, m;

  for (i=0, n=DEPS.length; i<n; ++i) {
    prop = DEPS[i];
    dep = this._deps[prop];
    for (j=0, m=dep.length; j<m; ++j) {
      if (pulse[prop][dep[j]]) return true;
    }
  }

  return false;
};

module.exports = Node;