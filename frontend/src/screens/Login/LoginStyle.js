import { makeStyles } from '@material-ui/core/styles';

export default makeStyles(theme => ({
	root: {
		minHeight: '100vh',
		backgroundImage: 'url(https://source.unsplash.com/random/1440x824)',
		backgroundRepeat: 'no-repeat',
		backgroundColor: theme.palette.grey[900],
		backgroundSize: 'cover',
		backgroundPosition: 'center',
	},
	card: {
		marginTop: theme.spacing(8),
		marginBottom: theme.spacing(8),
		minWidth: 275,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		position: 'relative',
	},
	paper: {
		marginTop: theme.spacing(8),
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
	},
	avatar: {
		margin: theme.spacing(1),
		backgroundColor: theme.palette.success.main,
	},
	submit: {
		margin: theme.spacing(3, 0, 2),
	},
	marginVertical: {
		marginTop: theme.spacing(2),
		marginBottom: theme.spacing(2),
	},
	form: {
		paddingLeft: 75,
		paddingRight: 75,
		paddingBottom: 75,
		[theme.breakpoints.down('sm')]: {
			paddingLeft: theme.spacing(2),
			paddingRight: theme.spacing(2)
		}
	},
	title: {
		marginTop: theme.spacing(3)
	},
	textField: {
		marginTop: theme.spacing(3)
	},
	signInButton: {
		margin: theme.spacing(2, 0)
	},
	errorMessgae: {
		color: theme.palette.error.main
	},
	googleLoginBtn: {
		width: '100%',
		justifyContent: 'center',
	},
	backdrop: {
		zIndex: theme.zIndex.drawer + 1,
		color: '#fff',
	},
	cursorPointer: {
		cursor: 'pointer',
	}
}));