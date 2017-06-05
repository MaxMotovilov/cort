// Cort tested exhaustively!
//
// Copyright (c) 2017 12 Quarters Consulting & ...Max...
// MIT License - https://raw.githubusercontent.com/MaxMotovilov/cort/master/LICENSE

exports = module.exports = function cort( test_case, complete, options ) {
    var root, path = [], run_no = 0;

    runTestCase();

    function runTestCase() {
        var curr, pos = 0, pending;

        const pool = [],
              meta = {
                get name() {
                    var result = [], n = run_no - 1;

                    do {
                        result.push( String.fromCharCode( n % 26 + "a".charCodeAt(0) ) );
                        n = Math.floor( n / 26 );
                    } while( n > 0 );

                    return result.reverse().join( "" )
                },

                get trace() { return path.slice( 0, pos ).map( cleanTag ) },

                get todo() { return path.slice( pos ).map( cleanTag ) }
              }

        ++run_no;

        if( options && options.maxRuns && run_no > options.maxRuns ) {
            complete( Error( "maxRuns exceeded" ), meta );
            return
        }
             
        test_case( later, done, meta );

        function later( tag, fn ) {

            const seq = this && this.later && this || { later: later, tags: [] };

            if( fn == null ) {
                fn = tag;
                tag = fn.toString();
            }

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
                 complete( err, meta );
            else if( pool.length > 0 || pos < path.length )
                complete( Error( "done() called before test case completion" ), meta );
            else
                nextTestCase();
        }

        function pendingNextStep() {
            if( !pending ) {
                pending = true;
                (options && options.enqueue || setImmediate)( nextStep );
            }
        }

        function nextStep() {
            var next;

            if( path.length == pos ) {
                // Growing the tree

                pool.sort( initialStepOrder );	

                if( pool[0].running ) {
                    // top candidate still running, wait for it to complete
                    pending = false;
                    return
                }

                let node = { next: {}, pool: pool.slice() }

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
                        Error( "Non-deterministic test case: expected choice not available\n" + path[pos] ),
                        meta
                    );
                    return
                } else if( pool[next_index].running ) {
                    // action we are waiting for is still running, wait for it to complete
                    pending = false;
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

            if( pool.length && !pool[ pool.length - 1 ].running )
                // There is at least one pending step in the pool, so try again after executing current one
                (options && options.enqueue || setImmediate)( nextStep );
            else
                pending = false;

            try {
                if( has_duration )
                    next.fn( makeReadyCallback( ready, pool[0] ) );
                else
                    next.fn();
            } catch( err ) {
                complete( err, meta )
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
                    runTestCase();
                    return
                }
            }
        }

        complete();
    }
}

function initialStepOrder( a, b ) {
    return (b.running === false) - (a.running === false) ||
           tagList(a).localeCompare( tagList(b) )
}

function makeReadyCallback( ready, item ) {
    return callback => function() { ready( item, () => callback.apply( this, arguments ) ) } 
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
