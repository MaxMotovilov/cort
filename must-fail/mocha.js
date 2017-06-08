const cort = require( "../mocha" ),
      assert = require( "assert" ); 

it = cort( it );

describe( "Failing tests", function() {

    this.retries( 2 );

    it( "assertionFail", function( later, done ) { 
        var total = 3;

        later( () => action( "A" ) );

        later( () => action( "B" ) )
            .later( () => assert( false ) );

        function action( name ) {
            console.log( " -", name );
            if( --total == 0 )
                done();
        }
    } );
} );
