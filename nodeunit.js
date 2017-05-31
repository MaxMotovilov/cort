// Cort plugin API for https://github.com/caolan/nodeunit 
//
// Copyright (c) 2017 12 Quarters Consulting & ...Max...
// MIT License - https://raw.githubusercontent.com/MaxMotovilov/cort/master/LICENSE

const nodeunit = require( "nodeunit/lib/core" ),
	  nodeunit_runTest = nodeunit.runTest,
	  core = require( "./index" );

var	runner_completion, next_permutation, test_case_prefix, runner_opts;

// Monkey-patch for nodeunit.runTest, until a better solution is available
nodeunit.runTest = function( name, fn, opts, callback ) {

	runner_completion = callback;
	test_case_prefix = name;
	runner_opts = opts;
	next_permutation = null;

	nodeunit_runTest( name, fn, opts, function() {
		( next_permutation || runner_completion )
			.apply( this, arguments )
	} )
}

exports = module.exports = function( test_case, core_opts ) {

	return firstPermutation

	var run, nodeunit_api, nodeunit_done, last_runner_args;

	function firstPermutation( test ) {
		nodeunit_api = test;
		core( runPermutation, noMorePermutations, core_opts );
	}

	function runPermutation( later, done, meta ) {

		next_permutation = function( err, ...args ) {
			if( nodeunit_done )
				// Failure from Cort core
				runner_completion( err, ...args );
			else if( err != null )
				// Failure from nodeunit
				last_runner_args = args,
				done( err );
			else
				nodeunit_runTest( 
					test_case_prefix + "-" + meta.name,
					run,
					runner_opts,
					next_permutation
				);
		}

		run = function( test ) {
			nodeunit_done = test.done;
			nodeunit_api = null;
			test.done = done;
			test_case( test, test.later = later.bind( null ) );
		}
			
		if( nodeunit_api )
			run( nodeunit_api );
		else if( nodeunit_done ) {
			let done = nodeunit_done;
			nodeunit_done = null;
			done();
		} else
			throw Error( "Assertion failed in cort/nodeunit: out-of-sequence call" );
	}

	function noMorePermutations( err, meta ) {
		if( err != null && err.stack )
			err.stack = err.stack.replace( /^.*\n/, msg => 
				msg + meta.trace.map( t => " after " + t + "\n" ).join( "" ) 
				    + meta.todo.map(  t => "before " + t + "\n" ).join( "" ) 
			);

		if( nodeunit_done )
			nodeunit_done( err );
		else
			runner_completion( err, ...(last_runner_args || []) );
	}
}

