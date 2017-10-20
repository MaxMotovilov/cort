// Cort tested exhaustively!
//
// Copyright (c) 2017 12 Quarters Consulting & ...Max...
// MIT License - https://raw.githubusercontent.com/MaxMotovilov/cort/master/LICENSE

exports.run = function run( test_case, complete, options ) {
    const meta = {};

    cort(
        test_case,
        null,
        err => err ? complete( err, meta ) : complete(),
        options,
        meta
    )()
}

exports.iterate = function iterate( test_case, options ) {

    return iterator( null, [], 0 )

    function iterator( root, path, run_no ) {
        const result = loop(),

              iteration = cort(
                    test_case,
                    (new_root, new_run_no) => {
                        root = new_root;
                        run_no = new_run_no;
                        next();
                    },
                    err => done( err ),
                    options,
                    result,
                    root,
                    path,
                    run_no
              );

        var	next, done;

        result.copy = () => iterator( deepCopy( root ), path.slice(), run_no );

        return result;
    
        function* loop() {
            var promise, finished;

            while( !finished ) {
                promise = (options && options.promise || builtinPromise)(
                    function( resolve, reject ) {
                        next = () => {
                            promise = null;
                            resolve( true );
                        }
                        done = err => {
                            promise = null;
                            finished = true;
                            if( err != null )
                                reject( err );
                            else
                                resolve( false );
                        }
                    }
                );

                (options && options.enqueue || setImmediate)( iteration );

                yield promise;

                if( promise )
                    throw Error( "Assertion failed in cort: next() called before run has completed" );
            }
        }
    }	 
}

function cort( iteration, next_iteration, complete, options, meta, root, path, run_no ) {

    var pos;

    path = path || [];
    run_no = run_no || 0;

    Object.defineProperties( meta, {
        name:  { get: function() {
            var result = [], n = run_no - 1;

            do {
                result.push( String.fromCharCode( n % 26 + "a".charCodeAt(0) ) );
                n = Math.floor( n / 26 );
            } while( n > 0 );

            return result.reverse().join( "" )
        } },

        trace: { get: function() { return path.slice( 0, pos ).map( cleanTag ) } },

        todo:  { get: function() { return path.slice( pos ).map( cleanTag ) } }
    } );

    return runTestCase

    function runTestCase() {
        var curr, pending, finished;
        const pool = [];

        pos = 0;
        ++run_no;

        if( options && options.maxRuns && run_no > options.maxRuns ) {
            complete( Error( "maxRuns exceeded" ), meta );
            return
        }

        iteration( later, done, meta );

        function later( fn, tag ) {

            const seq = this && this.later && this || { tags: [], promise: promisifyLater };
            if( !seq.later )
                seq.later = later.bind( seq );

            if( tag == null )
                tag = fn.toString();

            pool.push( { seq: seq, pos: seq.tags.length, fn: fn } );
            seq.tags.push( tag );

            pendingNextStep();

            return seq
        }

        function ready( item, callback ) {
            item.running = false;
            item.fn = callback;
            pendingNextStep();
        }

        function done( err ) {
            if( err != null )
                 complete( err );
            finished = true;			
            pendingNextStep();
        }

        function pendingNextStep() {
            if( !pending ) {
                pending = true;
                (options && options.enqueue || setImmediate)( nextStep );
            }
        }

        function nextStep() {
            var next;

            pending = false;

            if( pool.length > 0 ) {
                if( path.length == pos ) {
                    // Growing the tree

                    pool.sort( initialStepOrder );	

                    if( pool[0].running )
                        // top candidate still running, wait for it to complete
                        return

                    let node = { 
                        next: {}, 
                        pool: pool.map( 
                            item => ({ seq: { tags: item.seq.tags }, pos: item.pos, running: item.running }) 
                        )
                    }

                    if( pos == 0 )
                        root = curr = node;
                    else
                        curr = curr.next[ path[pos-1] ] = node;

                    path.push( tagList( pool[0] ) );

                    next = pool.shift();
                } else {
                    // Navigating the path

                    let next_index = pool.findIndex( item => tagList( item ) == path[pos] );

                    if( next_index < 0 ) {
                        complete( 
                            Error( "Non-deterministic test case: expected step not scheduled\n" + path[pos] )
                        );
                        return
                    } else if( pool[next_index].running ) {
                        // action we are waiting for is still running, wait for it to complete
                        return
                    } else {
                        curr = pos == 0 ? root : curr.next[ path[pos-1] ];
                        if( !curr )	
                            nodeNotFound();

                        [next] = pool.splice( next_index, 1 );
                    }
                }

                let has_duration = next.running == null && next.fn.length;

                if( has_duration )
                    // Start action and wait for completion
                    pool.unshift( { seq: next.seq, pos: next.pos, running: true } );

                ++ pos;

                if( pool.some( item => !item.running ) )
                    // There is at least one pending step in the pool, so try again after executing current one
                    pendingNextStep();

                try {
                    if( has_duration )
                        next.fn( makeReadyCallback( ready, pool[0] ) );
                    else
                        next.fn();
                } catch( err ) {
                    complete( err )
                }			
            }

            if( pool.length == 0 && !pending && finished ) {
                if( pos < path.length )
                    complete( Error( "Non-deterministic test case: done() called before expected steps completed" ) );
                nextTestCase();
            }
        }

        function promisifyLater() {
            // this = sequence object
            const key = tagList( { seq: this, pos: this.tags.length-1 } ),
                  item = pool.find( item => tagList( item ) == key ),
                  fn = item && item.fn;

            if( !item )
                throw Error( "later().promise() used out of sequence" );

            return (options && options.promise || builtinPromise)( fn.length ? wrap1 : wrap0 );

            function wrap0( resolve, reject ) {
                item.fn = () => {
                    try {
                        resolve( fn() )
                    } catch( err ) {
                        reject( err )
                    }
                }	
            }

            function wrap1( resolve, reject ) {
                item.fn = ready => {
                    try {
                        resolve( fn( ready ) )
                    } catch( err ) {
                        reject( err )
                    }
                }	
            }
        }
    }

    function nextTestCase() {
        var tried, curr, pos;

        while( path.length > 0 ) {
            tried = path.pop();
            curr = root;

            try {
                path.forEach( tag => (curr = curr.next[tag]) );
                pos = curr.pool.findIndex( item => tagList( item ) == tried );
            } catch( e ) {
                nodeNotFound()
            }

            if( pos < 0 )
                nodeNotFound();
            else while( ++pos < curr.pool.length ) {
                if( curr.pool[pos].pos == 0 || path.indexOf( tagList( curr.pool[pos], -1 ) ) >= 0 ) {
                    path.push( tagList( curr.pool[ pos ] ) );

                    if( next_iteration )
                        next_iteration( root, run_no );
                    else
                        runTestCase();
 
                    return
                }
            }
        }

        complete();
    }

    function makeReadyCallback( ready, item ) {
        const result = 
                callback => function() { 
                    ready( item, () => callback.apply( this, arguments ) ) 
                }
     
        result.when = 
                v_or_p => v_or_p && typeof v_or_p.then === 'function'
                    ? v_or_p.then( x => whenReady( x ), err => whenReady( null, err ) )
                    : whenReady( v_or_p )
    
        return result

        function whenReady( value, err ) {
            return (options && options.promise || builtinPromise)(
                (resolve, reject) =>
                    ready( item, err == null ? () => resolve( value ) : () => reject( err ) )
            )
        }
    }
}

function builtinPromise( init ) {
    return new Promise( init )
}

function deepCopy( x ) {
    return JSON.parse( JSON.stringify( x ) )
}

function initialStepOrder( a, b ) {
    return (b.running === false) - (a.running === false) ||
           tagList(a).localeCompare( tagList(b) )
}

function nodeNotFound() {
    // Bug in cort
    throw Error( "Assertion failed in cort: node not found at path" )
}

function tagList( item, rel ) {
    return item.seq.tags.slice( 0, item.pos + 1 + ( rel || 0 ) ).join( "\xffff" ) + (item.running != null ? '\xfffe' : '') 
}

function cleanTag( t ) {
    return t.replace( /^[\s\S]*\xffff/, "" ).replace( /\xfffe$/, " (completed)" )
}
