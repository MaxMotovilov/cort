// Cort plugin API for https://github.com/mochajs/mocha
//
// Copyright (c) 2017 12 Quarters Consulting & ...Max...
// MIT License - https://raw.githubusercontent.com/MaxMotovilov/cort/master/LICENSE

const core = require( "./index" );

exports = module.exports = function cort( mocha_it, options ) {
    const it = wrapApi( mocha_it, options );
    it.only = wrapApi( mocha_it.only, options );
    return it
}

// This code relies on the knowledge of Mocha implementation details which are
// subject to change without notice in subsequent versions. There appears to
// be no supported and documented way to create test cases dynamically in Mocha.

function wrapApi( it, options ) {
    return function( title, fn ) {
        const test = makeTestCase( core.iterate( forward, options ), fn => it( title, fn ), title ),
              suite = test.parent;

        if( !(suite.tests instanceof InPlaceSlice) )
            suite.tests = new InPlaceSlice( suite.tests );

        return test;

        function forward() { fn.apply( suite.ctx, arguments ) }
    }
}

function makeTestCase( iterator, factory, title ) {
    const test = factory( mocha_done => {

                // Mocha passes in this=context but we ignore it and use suite.ctx instead
                const current = iterator;

                if( test.retries() > 0 )
                    iterator = current.copy();

                const { value, done } = current.next();

                if( done )
                    throw Error( "Assertion failed in cort/mocha: premature end of iteration" );

                value.then(
                    more => {
                        if( more )
                            makeTestCase( current, fn => {
                                const copy = new test.constructor( title + " [" + current.name + "]", fn ),
                                      index = suite.tests.indexOf( test );
                                suite.addTest( copy );
                                suite.tests.splice( index+1, 0, suite.tests.pop() );
                                return copy;
                            }, title );
                        else
                            iterator = null; // Garbage-collect the generator as early as possible
                        mocha_done();
                    },
                    err => {
                        if( !( test.retries() > 0 ) )
                            // Do not null the iterator if the test might yet be re-run!
                            iterator = null; 

                        if( err != null && err.stack )
                            err.stack = err.stack.replace( /^.*\n/, msg => 
                                msg + current.trace.map( t => " after " + t + "\n" ).join( "" ) 
                                    + current.todo.map(  t => "before " + t + "\n" ).join( "" ) 
                            );

                        mocha_done( err );
                    }
                );
          } ),
          suite = test.parent;

    return test;
}

class InPlaceSlice extends Array {
    constructor( from, ...rest ) {
        if( from instanceof Array )
            super( ...from );
        else
            super( from, ...rest );
    }

    slice( from, to ) { return new Window( this, from, to ) }
}

class Window {
    constructor( array, from, to ) {
        this.array = array;
        this.from = from || 0;
        this.to = to;
    }

    shift() {
        return this.array[ this.from++ ]
    }

    unshift( what ) {
        this.array[ --this.from ] = what;
        return this.length
    }

    get length() {
        return this.end - this.from
    }

    get end() {
        return this.to == null ? this.array.length : this.to < 0 ? this.array.length + this.to : this.to
    }
}
