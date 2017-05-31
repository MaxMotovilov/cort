# COmbinatorial Reachability Testing for asynchronous unit tests

_Cort tested exhaustively!_

## Rationale

Asynchronous code generally demands asynchronous unit tests: one has to verify that
potentially interacting asynchronous actions complete correctly when executed in an
arbitrary order. Unfortunately, this means testing _every possible order_, massively
replicating test cases even of a moderate complexity as the number of possible
execution sequences grows combinatorially.

This library purports to automate this process by enumerating all permutations of the
asynchronous steps in a test case. It is not a full-featured unit testing framework;
instead, it is designed to integrate with existing ones. Unit test code is required
to specify its asynchronous steps as callback arguments to the extension API provided
by Cort plugins.

## Core API

Standalone usage of the permutation algorithm outside of a compatible unit testing framework:

	const cort = require( "cort-unit" );

    cort( testCase, complete, { maxRuns: 10 } );

    function testCase( later, done, meta ) {
        console.log( "Variant:", meta.name );
        later( () => console.log( "Step 1" ) );
        later( () => console.log( "Step 2" ) )
            // Will fail in the last permutation!
            .later( "Step 3", () => ( console.log( "Step 3" ), done() ) );
    }

    function complete( err, meta ) {
        if( err ) {
            console.log( err.stack );
            console.log( meta.trace.join( "\n" ), "\n----\n", meta.todo.join( "\n" ) );
        } else {
            console.log( "All permutations succeeded!" );
        }
    }

### cort()

Acts as a looping construct: `testCase()` is called repeatedly until all permutations of
its asynchronous steps are exhausted or an uncaught exception terminates the execution
prematurely. Since the code in `testCase()` is presumed to be asynchronous, it has to signal
its completion by calling `done()`. Individual runs of the test case do not overlap.

The callback `complete()` is guaranteed to be called exactly once. In case of successful completion,
it is called with no arguments. Early termination passes in the error object as well as the same
metadata object `meta` as is passed into the `testCase()` itself.

The last optional argument can be used to pass in a dictionary of options:

* `maxRuns` - integer; limits the number of permutations to execute. Note that a completion due
to exceeding `maxRuns` is considered an error;
* `enqueue` - function expecting one argument, a callback function to be executed asynchronously. 
If not specified, `setImmediate()` is used to enqueue the asynchronous steps. 

### later()

Used by the test case code to specify an asynchronous step: a callback function with no
arguments; ES6 arrow functions provide a compact and convenient syntax. Optional first argument
can be used to tag the step with a unique text string. If tag is omitted, string representation
of the callback function is used. Note that uniqueness of the tag is important to the permutation
algorithm!

Asynchronous steps can be chained: `later( step_1 ).later( step_2 )` will ensure that `step_2` is
executed after `step_1` in all generated permutations (although unrelated steps may well be executed
between them). For example:

    var x;
    later( () => (x = foo()) )
      .later( () => bar( x ) );

### done()

Should be called by the test case code to signal completion and execute the next permutation, if any.
Passing an `Error` object into `done()` has the same effect as throwing an exception. Calling `done()`
when some of the asynchronous steps were already enqueued but have not yet completed is a detected
error.

### meta
 
The metadata object used to identify current permutation provides the following properties:

* `name` - a short unique identifier normally used as a suffix in the test case name;
* `trace` - an array of tags identifying steps that have already executed (or commenced executing) in this run;
* `todo` - an array of tags indentifying steps that are yet to be executed in the selected permutation; it is
empty in most simple cases and never includes _all_ of the steps that would be executed if the permutation
were to complete successfully.

## [nodeunit](https://github.com/caolan/nodeunit) API

    const cort = require( "cort-unit/nodeunit" ),
          assert = require( "assert" );

    exports.test = cort( function( test ) {
        var a, b;
        test.later( () => (a=1) )
            .later( () => assert.equal( ++a, 2 ) )
            .later( "Last - A", () => a == b && test.done() );
        test.later( () => (b=1) )
            .later( () => assert.equal( ++b, 2 ) )
            .later( "Last - B", () => a == b && test.done() );
    } );

### cort()

Acts as a decorator for the [nodeunit](https://github.com/caolan/nodeunit) test cases: it automatically injects
the test case into execution sequence multiple times, varying its name accordingly (`test`, `test-b`, `test-c`...)
The `later()` API is injected into the `test` object (it is also passed in as the 2nd argument of the test case
function).
