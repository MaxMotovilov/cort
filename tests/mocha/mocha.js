const cort = require( "../../mocha" ),
      assert = require( "assert" ); 

it = cort( it );

describe( "cort/mocha tests", () => {

    var constant;

    beforeEach( () => constant = 1 );
    afterEach( () => console.log( "Constant =", constant ) );

    it( "Minimal", function( later, done ) {
        assert.equal( constant++, 1 );

        later( () => action( "A" ) );

        later( () => action( "B" ) )
            .later( () => action( "C" ) );

        done();
    
        function action( name ) {
            console.log( " -", name );
        }
    } )
} )
