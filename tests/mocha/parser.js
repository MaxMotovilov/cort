const cort = require( "../../mocha" ),
      assert = require( "assert" ),
      stream = require( "stream" );

describe( "Streaming parser example", () => {
    
    const test_data = [
        "Lin", "e 1\nLine 2", "\nLine 3\n", "Line 4", "\nLine ", "5"
    ];

    var runs = 0;

    cort( it )( "should reconstruct lines", function( later, done ) {

        var chunk_no = 0, line_no = 0;

        const parser = new StreamingLineParser;

        ++runs;

        parser.on( 'readable', consume )
              .on( 'end', done );

        // Asynchronous producer
        test_data.reduce( 
            (seq, chunk, i) => (seq.later || later)( "Write chunk " + i, () => parser.write( chunk ) )
        , {} ).later( () => parser.end() );

        // Asynchronous consumer
        function consume() {
            const line = parser.read();

            if( line != null ) {
                assert.equal( line, "Line " + ++line_no );
                later( "Read line " + line_no, consume );
            }
        }
    } );

    it( "should execute 2240 variations", () => assert.equal( runs, 2240 ) );

} );

class StreamingLineParser extends stream.Transform {

    constructor() {
        super( { readableObjectMode: true, decodeStrings: false } );
        this.remainder = "";
    }

    _transform( string, _, callback ) {
        this.remainder = (this.remainder + string)
            .replace( /(.*)\n/g, (_, line) => ( this.push( line ), '' ) );
        callback(); 
    }

    _flush( callback ) {
        if( this.remainder )
            this.push( this.remainder );
        callback();
    }
}
