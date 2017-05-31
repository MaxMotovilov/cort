const 	cort = require( "../nodeunit" ),
        assert = require( "assert" );

exports.foreign = function( test ) {
    test.done()
}

exports.minimal = cort( 
    function( test ) {
        var total = 3;

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
