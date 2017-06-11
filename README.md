COmbinatorial Reachability Testing for asynchronous unit tests
==============================================================

_Cort tested exhaustively!_

## Rationale

Asynchronous code generally demands exhaustive unit tests: one has to verify that
potentially interacting asynchronous actions complete correctly when executed in an
arbitrary order. Unfortunately, this means testing _every possible order_, massively
replicating test cases even of a moderate complexity as the number of possible
execution sequences grows combinatorially.

This library purports to automate this process by enumerating all permutations of the
asynchronous steps in a test case. It is not a full-featured unit testing framework;
instead, it is designed to integrate with existing ones. Unit test code is expected
to describe its asynchronous steps using extension APIs provided by Cort plugins.

### In depth 

[TL;DR](#common-api): _the rest of this section is whitepaper material; follow the link
to usage docs below._ 

----------------------------------------------------------------------

The complexity of testing parallel code comes from _logically simultaneous_ 
events that may legitimately occur in any relative order. In absence of side effects,
the order wouldn't matter. When side effects are present -- especially side effects that 
may be concealed from the programmer behind API barriers -- it becomes critical to ensure
that the code will work correctly no matter what the true physical order of the logically
simultaneous, side effect producing actions proves to be. 

Asynchronous single-threaded programming model found in Javascript softens the impact somewhat, 
as synchronous code sequences (i.e. those not yielding control back to the event loop in the 
interim) can only run one after the other rather than concurrently, as is common in multi-threaded 
programming. This should not unduly alleviate the concerns, as the actions "logically atomic" 
from the standpoint of the user code (i.e. performed inside 3rd party code as a result of an 
API call) are very often asynchronous in nature; also, real-world architectures tend to employ 
multiple interacting reactor loops (e.g. multiple instances of **node.js** communicating over 
TCP sockets) which do indeed execute concurrently. 

#### Example 1: streaming parser

As an example, consider a streaming record parser that accepts a character stream as input
and produces records (objects) from it on demand, as they become available. It is convenient
to provide a pipe API to such a component: a [Writable](https://nodejs.org/dist/latest/docs/api/stream.html#stream_writable_streams) 
stream for the characters received from an external source (e.g. piped from a socket or file)
and a [Readable](https://nodejs.org/dist/latest/docs/api/stream.html#stream_readable_streams)
stream in object mode for the produced records; furthermore, it is convenient to operate the
latter in [paused mode](https://nodejs.org/dist/latest/docs/api/stream.html#stream_two_modes)
so that the record consuming code is not concerned with buffering and flow control. 

The expected usage pattern for such a parser is

    const parser = new Parser;
    parser.on( 'readable', tryReadRecord );
    input_stream.pipe( parser );

    function tryReadRecord() {
        var record = parser.read();
        if( record != null )
            consumeRecordAsync( record, tryReadRecord );
    }

(note that if record consumption wasn't asynchronous, it would have been much easier to operate
parser in flowing mode and consume every record inside a `data` handler; no buffering of records
would ever be required).

A naive unit test for the above component can look like this:

    const parser = new Parser;
    parser.on( 'readable', tryReadRecord );

    parser.write( test_data_chunk_1 );
    parser.write( test_data_chunk_2 );
    parser.write( test_data_chunk_3 );

    function tryReadRecord() {
        var record;
        while( (record = parser.read()) != null )
            assertRecordIsAsExpected( record );
    }

Of course it only tests a single, highly specific (and unlikely) scenario: the entirety of the 
data arriving before any of it is consumed! Making the test slightly less naive by converting
`assertRecordIsAsExpected()` into an asynchronous action

    function tryReadRecord() {
        var record = parser.read();
        if( record != null )
            assertRecordIsAsExpectedAsync( record, tryReadRecord );
    }

    function assertRecordIsAsExpectedAsync( record, callback ) {
        assertRecordIsAsExpected( record );
        setTimeout( callback, delay );
    }

does not change this scenario any. What we are after is making sure the parser works correctly
even when chunk 1 has some complete records and an incomplete beginning of another one whether
the consuming code does or does not request them prior to the arrival of chunk 2:

[Exhaustive test](https://github.com/MaxMotovilov/cort/blob/master/tests/mocha/parser.js)

At 2240 sequence permutations it is not just exhaustive but exhausting as well! Approaching this
level of testing rigor by sequencing the events manually is clearly unrealistic.

In order to automate the permutation of simultaneous events it is first necessary to know what they 
are. It is by no means obvious: while this information is certainly present in the code, extracting 
it by static analysis is a monumental task that requires, among other things, some prior knowledge 
about external asynchronous APIs the code is using. The preferred alternative is to have the programmer 
manually instrument unit test code to both provide this information and pass control to the  permutating 
tool at opportune times so that it can vary the relative timings. In Cort, [`later()` API](#later) 
serves this purpose.

#### Example 2: updating shared list

Let's consider another example: [updating a shared data structure.](https://github.com/MaxMotovilov/cort/blob/master/tests/mocha/shared.js) 
A key-value in-memory store ([memcached](https://memcached.org/), [Redis](https://redis.io/)...) 
is often used to provide  shared memory to multiple clustered instances of node.js services. 
Assuming a store that implements atomic _read_ and _swap_ (read old+write new), we want to store a 
list of records as a JSON formatted string in one of the keys and let multiple parallel clients add 
records to the  list without coordinating the activity via any other channels, or destructively interfering 
with each other's updates.

The algorithm used in this example is workable, if simplistic and likely suboptimal: while adding a record 
to the list, it keeps track of all records it has seen in any copies of the list obtained from the shared 
source by `swap()`-ping them with the currently accumulated set. Once a swap fails to introduce any new
records to the set, the algorithm considers list content stabilized (final list content is returned as a 
result of the `add()` method via a promise):

    class SharedList {
        constructor( store, key, client_id ) {
            this.store = store;
            this.key = key;
            this.client_id = client_id;
            this.record_id = 0;
        }

        add( record ) {
            const self = this, known_records = {};

            record = {
                id: this.client_id + "-" + ++this.record_id,
                data: record
            }

            known_records[ record.id ] = record;

            return this.store.read( this.key )
                       .then( tryUpdating )
                       .then( list => list.map( record => record.data ) );

            function tryUpdating( list ) {

                var record;

                list.forEach( record => {
                    if( !known_records[record.id] )
                        known_records[record.id] = record
                } );

                list = Object.keys( known_records ).map( id => known_records[id] );

                return self.store.swap( self.key, list )
                           .then( old_list =>
                                old_list.every( record => record.id in known_records ) 
                                    ? list : tryUpdating( old_list ) 
                            )
            }		
        }
    }

To test it, we mock up the `store` interface object expected to provide two asynchronous methods,
`read()` and `swap()` which in real use would issue network requests with unpredictable delays. In the
mockup, timing unpredictability is replaced with explicit permutation of event order ensured
by Cort. Since both methods are logically asynchronous actions with duration rather than events,
it is tempting to implement them using the 2nd form of `later()` that separately marks up initiation 
and completion of an asynchronous step:

    function promise( action ) {
        return new Promise( resolve => setImmediate( () => resolve( action() ) ) )
    }

...

    read( key ) {
        return later( 
            "Read " + this.client_id + "-" + ++this.tag_id, 
            ready => ready.when( promise( () => this.readSync( key ) ) ) 
        ).promise()
    }

    swap( key, value ) {
        return later( 
            "Swap " + this.client_id + "-" + ++this.tag_id, 
            ready => ready.when( promise( () => {
                const old_value = this.readSync( key );
                this.writeSync( key, value );
                return old_value
            } ) )
        ).promise()
    }
 
(the rest of the mock class can be seen in source code). Alas, this approach really brings
the combinatorial explosion into play: in my tests, **node.js** heap blew up somewhere between 200K and 
500K iterations. First thought upon seeing this was "There really is no replacement for formal
proofs of correctness!"  Fortunately, this time there was. While `read()` and `swap()` _appear_ to
be actions with extended duration, in reality (not just in a mockup, but in actual use!) they implement
_atomic_ operations. Therefore we don't need to vary their starting and finishing orders separately; it is
enough to only vary the order in which the operations as a whole execute:

    read( key ) {
        return later( 
            "Read " + this.client_id + "-" + ++this.tag_id, 
            () => this.readSync( key ) 
        ).promise()
    }

    swap( key, value ) {
        return later( 
            "Swap " + this.client_id + "-" + ++this.tag_id, 
            () => {
                const old_value = this.readSync( key );
                this.writeSync( key, value );
                return old_value
            }
        ).promise()
    }

After this simplification, 294 permutations exhaust all possible scenarios that can arise in
a simultaneous update from 3 clients. Admittedly, the question why 3 clients are both necessary
and sufficient still has to be answered for full credit in rigor.

#### Closing notes

* Reachability testing by combinatorial exhaustion of possible sequences is a powerful approach,
but its applicability is clearly limited to unit testing of crucial, well defined components:

    * In order to let Cort affect the order of asynchronous events/steps in the code,
they have to be manually instrumented. This is natural to do with the _test code_ (including mockups), 
in fact, as  simple as taking a working test and adding calls to `later()` around identified statements. 
Doing this to the code _being tested_ makes testing invasive: it may be good enough for proofing
algorithmic concepts but less than useful for regression testing and CI.

    * Combinatorial explosion is inescapable: number of permutations grows very fast with the length
and variability of the sequences. Throwing everything and the kitchen sink as input for the exhaustive
test does not work; both permutable steps and the inputs impacting the overall length of test sequence
have to be chosen carefully in order to preserve the balance between coverage and manageability.

* In the most general case, the permutable steps form a DAG (assuming that steps executed repeatedly
receive unique tags every time and represent distinct nodes) where edges are cause-and-effect relationships.
Cort does not provide facilities to describe an arbitrary DAG by specifying all of those relationships 
explicitly. Instead, it uses a seemingly natural approach of considering the steps executed in the same 
synchronous sequence to be arbitrarily permutable unless explicitly ordered by chaining calls to 
`later()`. Most of the cause-effect relationships are inferred by executing the code: step B scheduled 
for later execution as part of execution of step A is implicitly connected to it with an edge -- order 
of A and B will stay immutable in all permutations.  While practical, this approach may yet prove 
insufficient to cover some important scenarios.

* The 2nd form of `later()` (with the `ready` callback argument) was added to Cort API as a
natural way of describing all sorts of actions with duration, including, but not limited to, functions
returning promises. It introduces two connected nodes into the graph: the starting and completion points
of the step. As became clear in the [2nd example above](#example-2-updating-shared-list), it has a big 
impact on the number of permutations; it is still not clear whether this facility is strictly necessary 
or even provides significant convenience compared to using 2 separate calls to `later()` where necessary.

----------------------------------------------------------------------

## Common API

Each unit testing framework defines its own syntax for test cases. Cort generally expects
the test cases to be functions and passes in its two main APIs -- `later()` and `done()` either
as freestanding function parameters ([Mocha](#mocha-plugin-api)) or as methods on an interface object 
([nodeunit](#nodeunit-plugin-api)). 

### later()

    later( () => stream.write( chunk ) );
    later( "Notify consumers", () => source.emit( "dataReady" ) );

Used to specify an asynchronosly initiated immediate step, represented by a callback function with
no arguments; ES6 arrow functions provide a compact and convenient syntax. Optional first argument
can be used to tag the step with a unique text string. If tag is omitted, string representation
of the callback function is used in its place. Note that uniqueness of the tag is important to the 
permutating algorithm! 

Multiple calls to `later()` made synchronously (synchronicity is not strictly necessary -- depending 
on the implementation  of [`enqueue()`](#options), if overridden -- but should always be sufficient) 
will eventually execute their steps in all possible orders. To always execute a series of steps in a 
specific order, use chaining:

    later( () => stream.write( chunk_1 ) )
      .later( () => stream.write( chunk_2 ) );   
 
This is particularly useful to pass a value obtained from one step to the next:

    var stream;
    later( () => stream = openStream() )
      .later( () => stream.write( chunk ) );

To better understand how `later()` works, it may be thought of as a functional equivalent of

    setTimeout( () => do_something, random_delay )

where the permutating algorithm preselects the `random_delay`s for each run in such a way as to exhaust
all legitimate sequences of steps that may result.

In order to describe asynchronous steps with arbitrary duration, such as an API call that expects a
completion callback or returns a promise, use a modified form of `later()`:

    later( ready => fs.readdir( path_to_attachments, ready( processAttachments ) ) );
    later( ready => ready.when( db.query( "select * from invoices" ) ).then( processInvoices ) );

The above will not only vary the order in which `fs.readdir()` and `db.query()` are initiated, but
also the order in which `processAttachments()` and `processInvoices()` are called -- not depending
on actual durations of each step. Note that Cort does not take into account whether the asynchronous
action completes successfully or fails: `ready()` only serves to mark its temporal completion and
then passes the results on to the unit test code, unchanged.

#### later().promise()

    function mockAsyncCall() {
        return later( () => syncAction() ).promise()
    }

Provides an easy way of mocking up asynchronous APIs: promise will resolve to the result of `syncAction()`
once it executes (note that execution of `later()` itself only "schedules" the step; it will never
run in the same synchronous sequence where it was scheduled).

    function instrumentAsyncCall() {
        return later( ready => ready.when( asyncAction() ) ).promise()
    }

Instruments a promise-returning `asyncAction()` with permutable starting and finishing events; promise
returned by `instrumentAsyncCall()` will resolve to the result of `asyncAction()` but only _after_ the
finishing event executes (which, incidentally, will not be in the same synchronous sequence as the
resolution of the promise returned by `asyncAction()`). Note that if the promise from `asyncAction()`
is rejected, the rejection will not fail the test case but will pass on to the handlers attached
to the promise from `instrumentAsyncCall()` normally.

It is also possible to write:

    later( ready => asyncActionWithCallback( ready( callback ) ) ).promise()

but the resulting promise will resolve to the result returned by `asyncActionWithCallback()` when it
executes (i.e. before either `ready()` or `callback()` are called).

Chaining `.promise()` to the value returned by `later()` **must be** synchronous.

### done()

Should be called by the test case code to signal its completion and execute the next permutation, if any.
Passing an `Error` object into `done()` has the same effect as throwing an exception. Unlike the
similar API provided by the unit testing frameworks, Cort's `done()` is "soft" -- if  some of the 
asynchronous steps are already scheduled or started at the time `done()` is called without an argument,
the run will not complete until all steps have been fully executed.

### Metadata properties

Cort maintains metadata identifying separate runs (or permutations) of the test case. This metadata
is normally consumed by the plugins for unit testing libraries in order to modify test case names 
appearing in the reports and extend the assertion stacks with traces describing specific execution 
order that caused the failure; it is also available to the test case code.

* `name` - a short unique identifier normally used as a suffix in the test case name;
* `trace` - an array of tags identifying steps that have already executed (or commenced executing) in this run;
* `todo` - an array of tags indentifying steps that are yet to be executed in the selected permutation; it is
empty in most simple cases and never includes _all_ of the steps that would be executed if the permutation
were to complete successfully.

### Options

A dictionary of options can be passed to any of the top-level plugin APIs as an optional argument: 

* `maxRuns` - integer; limits the number of permutations to execute. Note that a completion due to exceeding 
`maxRuns` is considered an error;
* `enqueue` - function expecting one argument, a callback function to be executed asynchronously. If not specified, 
`setImmediate()` is used to enqueue the asynchronous steps;
* `promise` - a factory function for promises, accepting one argument: the initialization callback. It is used
by Cort whenever a new promise has to be issued and follows conventions of the built-in promise constructor;
the default implementation returns `new Promise(callback)`. Use it to select a different implementation of
promises if required; Cort does not use any functionality of promises other than construction and `.then()` chaining
method.

## [Mocha](https://github.com/mochajs/mocha) plugin API

    const cort = require( "cort-unit/mocha" );

    describe( "This thing", function() {
        cort( it )( "should work no matter what", function( later, done, meta ) {
            // Test case code
        } );
    } );

### cort()

Acts as a decorator for the [Mocha](https://github.com/mochajs/mocha) `it()` test case definition primitive.
Test cases used with Cort are always asynchronous, but instead of one callback argument they receive 
two: `later()` and `done()` (which is Cort's `done()` rather than Mocha's `done()` -- it soft-terminates only
the current run of the test case). Third argument of the test case is an object providing the metadata properties.

Returning a promise from the test case instead of accepting `done()` is not currently supported by the Cort Mocha
plugin.

Cort options, if any, can be passed into the decorator call as an optional 2nd argument.

## [nodeunit](https://github.com/caolan/nodeunit) plugin API

    const cort = require( "cort-unit/nodeunit" );

    exports.test = cort( function( test ) {
        // Test case code
    } );

### cort()

Acts as a decorator for the [nodeunit](https://github.com/caolan/nodeunit) test case functions. APIs `later()` and
`done()` are accessible to the test case code as methods on the `test` object; metadata properties can be accessed
via `test.meta`. 

Cort options, if any, can be passed into the decorator call as an optional 2nd argument.

## Core API

Cort core API is used by the plugins extending the APIs of unit testing libraries. As such, it is likely to be more
volatile than end user APIs; there's no real reason to consume it directly outside of Cort codebase.

At present, the core API provides two distinct interfaces to the permutating algorithm: a runner loop and a promise
generator.

### run()

    const cort = require( "cort-unit" );
    
    cort.run( test_case, complete, options );

    function test_case( later, done, meta ) {
        // Test case wrapper or body
    }

    function complete( err ) {
        // Called when all permutations are exhausted
    }

The runner loop API, `cort.run()` accepts a test case body with the usual arguments, a callback function `complete()`
that will be called exactly once: with no arguments in case of success or with the `Error` object if it is
is thrown by the test code, passed into the `done()` call or arises from an internal error in Cort code; third
optional argument can be used to pass in the dictionary of options.

### iterate()

    const cort = require( "cort-unit" );

    const iterator = cort.iterate( test_case, options );

    next( true );

    function next( more ) {
        if( !more )
            // 1st chance to detect normal completion
            return;

        var { value, done } = iterator.next();
        if( done )
            // 2nd chance to detect normal completion
            return;
        else
            // Can call iterator.copy() here
            return value.then( next, failed );
    }

    function failed( err ) {
        // Called only on failure
    }	

    function test_case( later, done, meta ) {
        // Test case wrapper or body
    }

The generator API, `cort.iterate()` accepts a test case body and an optional dictionary of options. It returns an
object conforming to the [iterator protocol](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Iteration_protocols);
the values returned by the iterator are promises that resolve upon completion of the corresponding test case run.
The consumer of this iterator **must not** call its `next()` method prior to resolution of the promise returned
by the previous call: code snippet above provides an outline for the correct usage; another example can be found
in the [Cort core tests.](https://github.com/MaxMotovilov/cort/blob/master/tests/nodeunit/basic.js) 

Note that the iterator API provides two ways of detecting the end of the loop: via the value the returned promise
resolves too (falsy value for the last iteration) or via the standard `done` flag returned by the call to `next()`.
Different usage scenarios may find one or the other more convenient.

The iterator returned by `cort.iterate()` also carries the [metadata properties](#metadata-properties) as well as
implements one additional method, `copy()`:

#### iterator.copy()

Returns a copy of the iterator that contains a duplicate of the internal data structure describing the discovered
steps and the permutations that have already been executed up to this point. It can be used to repeat specific runs
(retry the test case). This method **must not** be called prior to resolution of an already returned promise; the right 
place to do it is immediately prior to calling `next()`.
