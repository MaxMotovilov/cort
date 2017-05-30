# COmbinatorial Reachability Testing for asynchronous unit tests

Cort tested exhaustively!

## TL;DR
* Automatically tries all legitimate permutations of asynchronous steps in your unit test
* Plugs into [https://github.com/caolan/nodeunit](nodeunit), ...

## Core API

	const cort = require( "cort-unit" );

    cort( testCase, done, { maxRuns: 10 } );

    function testCase( later, done, meta ) {
        console.log( "Variant:", meta.name );
        later( () => console.log( "Step 1" ) );
        later( () => console.log( "Step 2" ) )
            // Will fail in the last permutation!
            .later( "Step 3", () => ( console.log( "Step 3" ), done() ) );
    }

    function done( err, meta ) {
        if( err ) {
            console.log( err.stack );
            console.log( meta.trace.join( "\n----\n" ) );
        } else {
            console.log( "All permutations succeeded!" );
        }
    }

