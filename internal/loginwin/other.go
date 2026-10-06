//go:build !windows

package loginwin

import "context"

// Supported reports whether login windows can be opened here
func Supported() bool { return false }

// Run is not available here: the user pastes the cookies in the settings instead
func Run(ctx context.Context, o Options) (map[string]string, error) { return nil, ErrUnsupported }
