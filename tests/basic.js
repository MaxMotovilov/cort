const 	cort = require( "../index" ),
        assert = require( "assert" );

function testCort( test, testCase, post ) {

    var variants = [];

    cort( wrapTestCase, wrapDone );

    function wrapTestCase( later, done, meta ) {
        console.log( "+", meta.name );
        variants.push( meta.name );
        testCase( later, done, meta );
    }

    function wrapDone( err, meta ) {
        if( err )
            console.log(
                err.message + "\n" +
                meta.trace.map( tag => "  after " + tag + "\n" ).join( "" ) +
                meta.todo.map(  tag => " before " + tag + "\n" ).join( "" )
            );

        post && post( err, variants );
        test.done();
    }
}

function fails( name_or_num ) {
    return function( err, variants ) {
        assert( err instanceof Error );
        if( name_or_num != null )
            assert.equal( name_or_num, typeof name_or_num == 'string' ? variants[ variants.length-1 ] : variants.length - 1 );
    }
}

function completes( num ) {
    return function( err, variants ) {
        assert.equal( err, null );
        assert.equal( variants.length, num );
    }
}

exports.minimal = function( test ) {
    testCort( test, testCase, completes( 3 ) );

    function testCase( later, done, meta ) {
        var total = 3;

        later( () => action( "A" ) );

        later( () => action( "B" ) )
            .later( () => action( "C" ) );

        function action( name ) {
            console.log( " -", name );
            if( --total == 0 )
                done();
        }
    }
}

exports.naive = function( test ) {
    testCort( test, testCase, fails( "c" ) );

    function testCase( later, done, meta ) {
        later( () => action( "A" ) );

        later( () => action( "B" ) )
            .later( "Action C", () => (action( "C" ), done()) );

        function action( name ) {
            console.log( " -", name );
        }
    }
}

exports.completion = function( test ) {
    testCort( test, testCase, completes( 6 ) );
    
    function testCase( later, done, meta ) {

        var total = 2;

        later( ready => setTimeout( ready( () => --total || done() ), 50 ) );
        later( ready => setTimeout( ready( () => --total || done() ), 100 ) );
    }
}

exports.completion2 = function( test ) {
    testCort( test, testCase, completes( 20 ) );
    
    function testCase( later, done, meta ) {

        var total = 2;

        later( ready => setTimeout( ready( next( "Path A" ) ), 50 ) );
        later( ready => setTimeout( ready( next( "Path B" ) ), 100 ) );

        function next( tag ) {
            return () => later( tag, () => --total || done() )
        }
    }
}

