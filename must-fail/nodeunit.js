const 	cort = require( "../nodeunit" ),
        assert = require( "assert" );

exports.assertionFail = cort( 
    function( test ) {
        var total = 3;

        test.later( () => action( "A" ) );

        test.later( () => action( "B" ) )
            .later( () => assert( false ) );

        function action( name ) {
            console.log( " -", name );
            if( --total == 0 )
                test.done();
        }
    }
)

exports.doneTooEarly = cort( 
    function( test ) {
        test.later( () => action( "A" ) );

        test.later( () => action( "B" ) )
            .later( () => action( "C" ) );

        function action( name ) {
            console.log( " -", name );
            if( name == "C" )
                test.done();
        }
    }
)

exports.expectationFail = cort( 
    function( test ) {
        var total = 3;
        test.expect( 1 );

        test.later( () => action( "A" ) );

        test.later( () => action( "B" ) )
            .later( () => action( "C" ) );

        function action( name ) {
            console.log( " -", name );
            if( --total == 0 )
                test.done();
        }
    }
)

