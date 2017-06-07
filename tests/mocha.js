var cort = require( "../mocha" ); 

it = cort( it );

describe( "cort/mocha tests", () => {
    it( "Minimal", function( later, done ) {
        var total = 3;

        later( () => action( "A" ) );

        later( () => action( "B" ) )
            .later( () => action( "C" ) );

        function action( name ) {
            console.log( " -", name );
            if( --total == 0 )
                done();
        }
    } )
} )
